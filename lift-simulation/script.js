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
        direction: "idle",
        processing: false,
        dom: {}
    };
}

// =========================
//   LIFT CONTROLLER LOGIC
// =========================

const LiftController = {
    FLOOR_TRAVEL_TIME: 1500,
    DOOR_TIME: 1800,

    requestPickup(floor, direction) {
        const key = `${floor}-${direction}`;
        if (AppState.activeCalls.has(key)) return;

        AppState.activeCalls.set(key, { floor, direction, createdAt: Date.now() });
        UI.markCallButton(floor, direction, true);
        UI.updateCallQueueList();

        const best = this.findBestLift(floor, direction);
        if (best !== null) this.assignLift(AppState.lifts[best], floor, direction);
    },

    findBestLift(floor, direction) {
        let best = null;
        let bestScore = Infinity;

        AppState.lifts.forEach((lift, i) => {
            const lastStop = lift.queue.length
                ? lift.queue[lift.queue.length - 1]
                : lift.currentFloor;

            const distance = Math.abs(lastStop - floor);
            const queuePenalty = lift.queue.length * 0.6;

            const score = distance + queuePenalty;

            if (score < bestScore) {
                bestScore = score;
                best = i;
            }
        });

        return best;
    },

    assignLift(lift, floor) {
        if (!lift.queue.includes(floor)) lift.queue.push(floor);

        lift.queue.sort((a, b) => a - b);

        UI.updateLiftPanel(lift);

        if (!lift.processing) this.processLift(lift);
    },

    async processLift(lift) {
        lift.processing = true;

        while (lift.queue.length > 0) {
            const target = lift.queue.shift();

            lift.direction =
                target > lift.currentFloor ? "up" :
                target < lift.currentFloor ? "down" : "idle";

            UI.updateLiftPanel(lift);
            await this.moveTo(lift, target);
            await this.operateDoors(lift);

            this.clearCalls(target);
        }

        lift.direction = "idle";
        lift.processing = false;
        UI.setLiftStatus(lift, "Idle");
        UI.updateLiftPanel(lift);
    },

    async moveTo(lift, targetFloor) {
        const floors = Math.abs(targetFloor - lift.currentFloor);
        const duration = floors * this.FLOOR_TRAVEL_TIME;

        UI.setLiftStatus(lift, lift.direction === "up" ? "Moving up" : "Moving down");
        UI.animateLift(lift.id, targetFloor, duration);
        UI.updateLiftPanel(lift);

        await this.wait(duration);

        lift.currentFloor = targetFloor;
        UI.updateLiftPanel(lift);
    },

    async operateDoors(lift) {
        UI.setLiftStatus(lift, "Doors opening");
        UI.setDoorState(lift.id, true);
        await this.wait(this.DOOR_TIME);

        UI.setLiftStatus(lift, "Doors closing");
        UI.setDoorState(lift.id, false);
        await this.wait(this.DOOR_TIME);
    },

    clearCalls(floor) {
        const erase = [];

        for (const [key, call] of AppState.activeCalls.entries()) {
            if (call.floor === floor) {
                erase.push(key);
                UI.markCallButton(call.floor, call.direction, false);
            }
        }

        erase.forEach((key) => AppState.activeCalls.delete(key));
        UI.updateCallQueueList();
    },

    wait(ms) {
        return new Promise(res => setTimeout(res, ms));
    }
};


// =========================
//   UI MANAGEMENT LAYER
// =========================

const UI = {

    // -------------------------
    // Create Floors + Shafts
    // -------------------------

    initBuilding() {
        const building = document.getElementById("building");
        building.innerHTML = "";
        building.style.position = "relative";

        // Build floors
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
                const up = document.createElement("button");
                up.className = "call-button";
                up.id = `call-btn-${floor}-up`;
                up.textContent = "▲";
                up.onclick = () => LiftController.requestPickup(floor, "up");
                actions.appendChild(up);
            }

            if (floor > 0) {
                const down = document.createElement("button");
                down.className = "call-button";
                down.id = `call-btn-${floor}-down`;
                down.textContent = "▼";
                down.onclick = () => LiftController.requestPickup(floor, "down");
                actions.appendChild(down);
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
        this.createLiftShaftAligned();
        this.positionLiftsAtGround();
    },

    // -------------------------
    // Properly Align Shaft
    // -------------------------

    createLiftShaftAligned() {
        const building = document.getElementById("building");
        const firstArea = building.querySelector(".lifts-area");

        const rect = firstArea.getBoundingClientRect();
        const buildingRect = building.getBoundingClientRect();

        const shaft = document.createElement("div");
        shaft.className = "lift-shaft";
        shaft.style.position = "absolute";
        shaft.style.top = "0";
        shaft.style.bottom = "0";
        shaft.style.left = (rect.left - buildingRect.left) + "px";
        shaft.style.width = rect.width + "px";

        building.appendChild(shaft);

        AppState.lifts.forEach((lift) => {
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
            doors.innerHTML = `
                <div class="lift-door left"></div>
                <div class="lift-door right"></div>
            `;

            liftEl.appendChild(doors);
            liftEl.appendChild(badge);
            liftEl.appendChild(status);

            lift.dom.element = liftEl;
            lift.dom.statusChip = status;

            shaft.appendChild(liftEl);
        });
    },

    // -------------------------
    // Movement Helpers
    // -------------------------

    captureFloorHeight() {
        const floor = document.querySelector(".floor");
        AppState.floorHeight = floor ? floor.offsetHeight : 80;
    },

    positionLiftsAtGround() {
        AppState.lifts.forEach((lift) => {
            const el = lift.dom.element;
            if (!el) return;

            el.style.transition = "none";
            el.style.bottom = "0px";
            el.offsetHeight;
            el.style.transition = "";
        });
    },

    animateLift(id, floor, duration) {
        const el = document.getElementById(`lift-${id}`);
        if (!el) return;

        const y = floor * AppState.floorHeight;

        el.style.transition = `bottom ${duration}ms linear`;
        el.style.bottom = `${y}px`;
    },

    setDoorState(id, open) {
        const el = document.getElementById(`lift-${id}`);
        if (!el) return;

        if (open) el.classList.add("doors-open");
        else el.classList.remove("doors-open");
    },

    setLiftStatus(lift, text) {
        if (lift.dom.statusChip) lift.dom.statusChip.textContent = text;
    },

    markCallButton(floor, dir, active) {
        const btn = document.getElementById(`call-btn-${floor}-${dir}`);
        if (!btn) return;

        active ? btn.classList.add("active") : btn.classList.remove("active");
    },

    // -------------------------
    // Side Panel UI
    // -------------------------

    initLiftPanels() {
        const container = document.getElementById("liftPanels");
        container.innerHTML = "";

        AppState.lifts.forEach((lift) => {
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
        lift.dom.panelDirection.textContent =
            lift.direction === "idle"
                ? "Idle"
                : lift.direction === "up"
                ? "Up"
                : "Down";

        lift.dom.panelQueue.textContent =
            lift.queue.length ? lift.queue.join(", ") : "–";

        lift.dom.panelDot.className = "lift-panel-dot";
        lift.dom.panelDot.classList.add(
            lift.direction === "idle"
                ? "idle"
                : lift.direction === "up"
                ? "up"
                : "down"
        );
    },

    updateCallQueueList() {
        const list = document.getElementById("callQueue");
        list.innerHTML = "";

        if (AppState.activeCalls.size === 0) {
            const li = document.createElement("li");
            li.textContent = "No pending requests";
            list.appendChild(li);
            return;
        }

        [...AppState.activeCalls.values()]
            .sort((a, b) => a.createdAt - b.createdAt)
            .forEach((call) => {
                const li = document.createElement("li");
                li.innerHTML = `
                    <span>Floor ${call.floor}</span>
                    <span class="call-tag">${call.direction.toUpperCase()}</span>
                `;
                list.appendChild(li);
            });
    }
};


// =========================
//   EVENT HANDLERS
// =========================

function startSimulation() {
    const floors = Number(document.getElementById("numFloors").value);
    const lifts = Number(document.getElementById("numLifts").value);

    let err = false;

    if (floors < 1 || floors > 20) {
        document.getElementById("floorsError").textContent = "Enter 1–20 floors";
        err = true;
    } else document.getElementById("floorsError").textContent = "";

    if (lifts < 1 || lifts > 10) {
        document.getElementById("liftsError").textContent = "Enter 1–10 lifts";
        err = true;
    } else document.getElementById("liftsError").textContent = "";

    if (err) return;

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
    document.getElementById("configScreen").style.display = "block";
    document.getElementById("simulationScreen").style.display = "none";

    document.getElementById("building").innerHTML = "";
    document.getElementById("liftPanels").innerHTML = "";
    document.getElementById("callQueue").innerHTML = "";

    AppState.lifts = [];
    AppState.activeCalls.clear();
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("startBtn").onclick = startSimulation;
    document.getElementById("resetBtn").onclick = resetSimulation;
});
