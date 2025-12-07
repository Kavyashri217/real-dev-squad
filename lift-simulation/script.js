// =========================
//   GLOBAL APP STATE
// =========================

const AppState = {
    numFloors: 0,
    numLifts: 0,
    lifts: [],
    activeCalls: new Map(),
    floorHeight: 0
};

function createLift(id) {
    return {
        id,
        currentFloor: 0,
        queue: [],
        direction: "idle",   // "up" | "down" | "idle"
        processing: false,
        dom: {
            element: null,
            statusChip: null,
            panel: null,
            panelDot: null,
            panelFloor: null,
            panelDirection: null,
            panelQueue: null
        }
    };
}

// =========================
//   LIFT CONTROLLER LOGIC
// =========================

const LiftController = {
    FLOOR_TRAVEL_TIME: 1500, // ms per floor
    DOOR_TIME: 1800,         // ms door open / close

    requestPickup(floor, direction) {
        const key = `${floor}-${direction}`;
        if (AppState.activeCalls.has(key)) return;

        AppState.activeCalls.set(key, {
            floor,
            direction,
            createdAt: Date.now()
        });

        UI.markCallButton(floor, direction, true);
        UI.updateCallQueueList();

        const index = this.findBestLift(floor);
        if (index === null) return;

        this.assignLift(AppState.lifts[index], floor);
    },

    findBestLift(targetFloor) {
        if (!AppState.lifts.length) return null;

        let bestIndex = null;
        let bestScore = Infinity;

        AppState.lifts.forEach((lift, i) => {
            const lastStop = lift.queue.length
                ? lift.queue[lift.queue.length - 1]
                : lift.currentFloor;

            const distance = Math.abs(lastStop - targetFloor);
            const queuePenalty = lift.queue.length * 0.6;
            const score = distance + queuePenalty;

            if (score < bestScore) {
                bestScore = score;
                bestIndex = i;
            }
        });

        return bestIndex;
    },

    assignLift(lift, floor) {
        if (!lift.queue.includes(floor)) {
            lift.queue.push(floor);
        }
        lift.queue.sort((a, b) => a - b);

        UI.updateLiftPanel(lift);

        if (!lift.processing) {
            this.processLift(lift);
        }
    },

    async processLift(lift) {
        lift.processing = true;

        while (lift.queue.length > 0) {
            const targetFloor = lift.queue.shift();

            if (targetFloor > lift.currentFloor) {
                lift.direction = "up";
            } else if (targetFloor < lift.currentFloor) {
                lift.direction = "down";
            } else {
                lift.direction = "idle";
            }

            UI.updateLiftPanel(lift);
            await this.moveToFloor(lift, targetFloor);
            await this.operateDoors(lift);
            this.clearServedCalls(targetFloor);
        }

        lift.direction = "idle";
        lift.processing = false;
        UI.setLiftStatus(lift, "Idle");
        UI.updateLiftPanel(lift);
    },

    async moveToFloor(lift, targetFloor) {
        const floorsToTravel = Math.abs(targetFloor - lift.currentFloor);
        if (floorsToTravel === 0) return;

        const duration = floorsToTravel * this.FLOOR_TRAVEL_TIME;
        const label = targetFloor > lift.currentFloor ? "up" : "down";

        UI.setLiftStatus(lift, `Moving ${label}`);
        UI.animateLift(lift.id, targetFloor, duration);
        UI.updateLiftPanel(lift);

        await this.wait(duration);

        lift.currentFloor = targetFloor;
        UI.updateLiftPanel(lift);
    },

    async operateDoors(lift) {
        UI.setLiftStatus(lift, "Doors opening");
        UI.setDoorState(lift.id, true);
        UI.updateLiftPanel(lift);
        await this.wait(this.DOOR_TIME);

        UI.setLiftStatus(lift, "Doors closing");
        UI.setDoorState(lift.id, false);
        UI.updateLiftPanel(lift);
        await this.wait(this.DOOR_TIME);
    },

    clearServedCalls(floor) {
        const toDelete = [];
        for (const [key, call] of AppState.activeCalls.entries()) {
            if (call.floor === floor) {
                toDelete.push(key);
                UI.markCallButton(call.floor, call.direction, false);
            }
        }
        toDelete.forEach(k => AppState.activeCalls.delete(k));
        UI.updateCallQueueList();
    },

    wait(ms) {
        return new Promise(res => setTimeout(res, ms));
    }
};

// =========================
//   UI LAYER
// =========================

const UI = {
    // ------- BUILDING & FLOORS -------

    initBuilding() {
        const building = document.getElementById("building");
        building.innerHTML = "";
        building.style.position = "relative";

        // Floors 0..n-1; CSS uses column-reverse so 0 is bottom visually
        for (let floor = 0; floor < AppState.numFloors; floor++) {
            const floorEl = document.createElement("div");
            floorEl.className = "floor";
            floorEl.dataset.floor = floor;

            const left = document.createElement("div");
            left.className = "floor-left";

            const label = document.createElement("div");
            label.className = "floor-label";
            label.textContent = floor;

            const actions = document.createElement("div");
            actions.className = "floor-actions";

            if (floor < AppState.numFloors - 1) {
                const upBtn = document.createElement("button");
                upBtn.className = "call-button";
                upBtn.id = `call-btn-${floor}-up`;
                upBtn.textContent = "▲";
                upBtn.addEventListener("click", () =>
                    LiftController.requestPickup(floor, "up")
                );
                actions.appendChild(upBtn);
            }

            if (floor > 0) {
                const downBtn = document.createElement("button");
                downBtn.className = "call-button";
                downBtn.id = `call-btn-${floor}-down`;
                downBtn.textContent = "▼";
                downBtn.addEventListener("click", () =>
                    LiftController.requestPickup(floor, "down")
                );
                actions.appendChild(downBtn);
            }

            left.appendChild(label);
            left.appendChild(actions);

            const liftsArea = document.createElement("div");
            liftsArea.className = "lifts-area";

            floorEl.appendChild(left);
            floorEl.appendChild(liftsArea);
            building.appendChild(floorEl);
        }

        this.captureFloorHeight();
        this.initLiftLayer();
        this.positionLiftsAtGround();
    },

    // ------- SINGLE VERTICAL SHAFT, CENTERED -------

    initLiftLayer() {
        const building = document.getElementById("building");
        // Remove old layer if any
        const existing = document.getElementById("lift-layer");
        if (existing) existing.remove();

        const layer = document.createElement("div");
        layer.id = "lift-layer";
        layer.style.position = "absolute";
        layer.style.top = "0";
        layer.style.bottom = "0";
        layer.style.left = "50%";
        layer.style.transform = "translateX(-50%)";
        layer.style.width = "80px"; // column width
        layer.style.pointerEvents = "none"; // clicks pass through

        building.appendChild(layer);

        AppState.lifts.forEach(lift => {
            const liftEl = document.createElement("div");
            liftEl.className = "lift";
            liftEl.id = `lift-${lift.id}`;

            const badge = document.createElement("div");
            badge.className = "lift-badge";
            badge.textContent = `L${lift.id + 1}`;

            const status = document.createElement("div");
            status.className = "lift-status-chip";
            status.id = `lift-status-${lift.id}`;
            status.textContent = "Idle";

            const doors = document.createElement("div");
            doors.className = "lift-doors";

            const leftDoor = document.createElement("div");
            leftDoor.className = "lift-door left";
            const rightDoor = document.createElement("div");
            rightDoor.className = "lift-door right";

            doors.appendChild(leftDoor);
            doors.appendChild(rightDoor);

            liftEl.appendChild(doors);
            liftEl.appendChild(badge);
            liftEl.appendChild(status);

            // allow vertical movement
            liftEl.style.position = "absolute";
            liftEl.style.left = "50%";
            liftEl.style.transform = "translateX(-50%)";
            liftEl.style.bottom = "0";

            lift.dom.element = liftEl;
            lift.dom.statusChip = status;

            layer.appendChild(liftEl);
        });
    },

    captureFloorHeight() {
        const building = document.getElementById("building");
        const buildingHeight = building.clientHeight;

        if (AppState.numFloors > 0) {
            AppState.floorHeight = buildingHeight / AppState.numFloors;
        } else {
            AppState.floorHeight = 80;
        }
    },

    positionLiftsAtGround() {
        AppState.lifts.forEach(lift => {
            const el = lift.dom.element;
            if (!el) return;
            el.style.transition = "none";
            el.style.bottom = "0px";
            // force reflow then re-enable transitions
            void el.offsetHeight;
            el.style.transition = "";
        });
    },

    animateLift(liftId, targetFloor, duration) {
        const el = document.getElementById(`lift-${liftId}`);
        if (!el) return;

        const bottom = targetFloor * AppState.floorHeight;
        el.style.transition = `bottom ${duration}ms linear`;
        el.style.bottom = `${bottom}px`;
    },

    setDoorState(liftId, open) {
        const el = document.getElementById(`lift-${liftId}`);
        if (!el) return;
        if (open) el.classList.add("doors-open");
        else el.classList.remove("doors-open");
    },

    setLiftStatus(lift, text) {
        if (lift.dom.statusChip) {
            lift.dom.statusChip.textContent = text;
        }
    },

    markCallButton(floor, direction, active) {
        const btn = document.getElementById(`call-btn-${floor}-${direction}`);
        if (!btn) return;
        if (active) btn.classList.add("active");
        else btn.classList.remove("active");
    },

    // ------- SIDE PANEL (LIFT STATUS) -------

    initLiftPanels() {
        const container = document.getElementById("liftPanels");
        container.innerHTML = "";

        AppState.lifts.forEach(lift => {
            const panel = document.createElement("div");
            panel.className = "lift-panel";

            panel.innerHTML = `
                <div class="lift-panel-header">
                    <span class="lift-panel-title">Lift ${lift.id + 1}</span>
                    <span class="lift-panel-dot idle"></span>
                </div>
                <div class="lift-panel-body">
                    <span>Floor</span><span class="p-floor">0</span>
                    <span>Direction</span><span class="p-dir">Idle</span>
                    <span>Queue</span><span class="p-queue">–</span>
                </div>
            `;

            lift.dom.panel = panel;
            lift.dom.panelDot = panel.querySelector(".lift-panel-dot");
            lift.dom.panelFloor = panel.querySelector(".p-floor");
            lift.dom.panelDirection = panel.querySelector(".p-dir");
            lift.dom.panelQueue = panel.querySelector(".p-queue");

            this.updateLiftPanel(lift);
            container.appendChild(panel);
        });
    },

    updateLiftPanel(lift) {
        if (!lift.dom.panel) return;

        lift.dom.panelFloor.textContent = lift.currentFloor;

        const dirText =
            lift.direction === "up" ? "Up" :
            lift.direction === "down" ? "Down" : "Idle";
        lift.dom.panelDirection.textContent = dirText;

        lift.dom.panelQueue.textContent =
            lift.queue.length ? lift.queue.join(", ") : "–";

        // dot colour
        const dot = lift.dom.panelDot;
        dot.className = "lift-panel-dot";
        if (lift.direction === "up") dot.classList.add("up");
        else if (lift.direction === "down") dot.classList.add("down");
        else dot.classList.add("idle");
    },

    // ------- CALL QUEUE LIST -------

    updateCallQueueList() {
        const list = document.getElementById("callQueue");
        list.innerHTML = "";

        if (AppState.activeCalls.size === 0) {
            const li = document.createElement("li");
            li.textContent = "No pending requests";
            list.appendChild(li);
            return;
        }

        const calls = Array.from(AppState.activeCalls.values()).sort(
            (a, b) => a.createdAt - b.createdAt
        );

        calls.forEach(call => {
            const li = document.createElement("li");
            const label = document.createElement("span");
            label.textContent = `Floor ${call.floor}`;

            const tag = document.createElement("span");
            tag.className = "call-tag";
            tag.textContent = call.direction.toUpperCase();

            li.appendChild(label);
            li.appendChild(tag);
            list.appendChild(li);
        });
    }
};

// =========================
//   APP LIFECYCLE
// =========================

function startSimulation() {
    const floors = Number(document.getElementById("numFloors").value);
    const lifts = Number(document.getElementById("numLifts").value);

    let hasError = false;

    if (!floors || floors < 1 || floors > 20) {
        document.getElementById("floorsError").textContent = "Please enter 1–20 floors";
        hasError = true;
    } else {
        document.getElementById("floorsError").textContent = "";
    }

    if (!lifts || lifts < 1 || lifts > 10) {
        document.getElementById("liftsError").textContent = "Please enter 1–10 lifts";
        hasError = true;
    } else {
        document.getElementById("liftsError").textContent = "";
    }

    if (hasError) return;

    AppState.numFloors = floors;
    AppState.numLifts = lifts;
    AppState.lifts = [];
    AppState.activeCalls.clear();

    for (let i = 0; i < lifts; i++) {
        AppState.lifts.push(createLift(i));
    }

    document.getElementById("metaFloors").textContent = floors;
    document.getElementById("metaLifts").textContent = lifts;

    UI.initBuilding();
    UI.initLiftPanels();
    UI.updateCallQueueList();

    document.getElementById("configScreen").style.display = "none";
    document.getElementById("simulationScreen").style.display = "block";
}

function resetSimulation() {
    document.getElementById("simulationScreen").style.display = "none";
    document.getElementById("configScreen").style.display = "block";

    document.getElementById("building").innerHTML = "";
    document.getElementById("liftPanels").innerHTML = "";
    document.getElementById("callQueue").innerHTML = "";

    AppState.lifts = [];
    AppState.activeCalls.clear();
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("startBtn").addEventListener("click", startSimulation);
    document.getElementById("resetBtn").addEventListener("click", resetSimulation);
});
