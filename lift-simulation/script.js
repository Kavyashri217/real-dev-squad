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
//   LIFT CONTROLLER
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

        const best = this.findBestLift(floor);
        if (best !== null) this.assignLift(AppState.lifts[best], floor);
    },

    findBestLift(targetFloor) {
        let best = null;
        let bestScore = Infinity;

        AppState.lifts.forEach((lift, index) => {
            const lastStop = lift.queue.length
                ? lift.queue[lift.queue.length - 1]
                : lift.currentFloor;

            const distance = Math.abs(lastStop - targetFloor);
            const queuePenalty = lift.queue.length * 0.6;
            const score = distance + queuePenalty;

            if (score < bestScore) {
                bestScore = score;
                best = index;
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
            const nextFloor = lift.queue.shift();

            if (nextFloor > lift.currentFloor) lift.direction = "up";
            else if (nextFloor < lift.currentFloor) lift.direction = "down";
            else lift.direction = "idle";

            UI.updateLiftPanel(lift);
            await this.moveToFloor(lift, nextFloor);
            await this.operateDoors(lift);
            this.clearServedCalls(nextFloor);
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
        await this.wait(this.DOOR_TIME);

        UI.setLiftStatus(lift, "Doors closing");
        UI.setDoorState(lift.id, false);
        await this.wait(this.DOOR_TIME);
    },

    clearServedCalls(floor) {
        const removes = [];

        for (const [key, call] of AppState.activeCalls.entries()) {
            if (call.floor === floor) {
                removes.push(key);
                UI.markCallButton(call.floor, call.direction, false);
            }
        }

        removes.forEach(key => AppState.activeCalls.delete(key));
        UI.updateCallQueueList();
    },

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};

// =========================
//   UI LAYER
// =========================

const UI = {

    // ---------------------------------
    // BUILD FLOORS + SHAFT + LIFTS
    // ---------------------------------

    initBuilding() {
        const building = document.getElementById("building");
        building.innerHTML = "";
        building.style.position = "relative";

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
                upBtn.onclick = () => LiftController.requestPickup(floor, "up");
                actions.appendChild(upBtn);
            }

            if (floor > 0) {
                const downBtn = document.createElement("button");
                downBtn.className = "call-button";
                downBtn.id = `call-btn-${floor}-down`;
                downBtn.textContent = "▼";
                downBtn.onclick = () => LiftController.requestPickup(floor, "down");
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

        this.setFloorHeight();
        this.createLiftLayer();
        this.positionLiftsAtGround();
    },

    // ---------------------------------
    // CORRECT FLOOR HEIGHT
    // ---------------------------------

    setFloorHeight() {
        const sample = document.querySelector(".floor");
        AppState.floorHeight = sample ? sample.offsetHeight : 80;

        console.log("Correct Floor Height =", AppState.floorHeight);
    },

    // ---------------------------------
    // CREATE FULL HEIGHT SHAFT
    // ---------------------------------

    createLiftLayer() {
        const building = document.getElementById("building");

        const old = document.getElementById("lift-layer");
        if (old) old.remove();

        const shaft = document.createElement("div");
        shaft.id = "lift-layer";

        shaft.style.position = "absolute";
        shaft.style.top = "0";
        shaft.style.bottom = "0";
        shaft.style.left = "50%";
        shaft.style.transform = "translateX(-50%)";
        shaft.style.width = "80px";
        shaft.style.pointerEvents = "none";

        building.appendChild(shaft);

        AppState.lifts.forEach(lift => {
            const el = document.createElement("div");
            el.className = "lift";
            el.id = `lift-${lift.id}`;

            el.style.position = "absolute";
            el.style.left = "50%";
            el.style.transform = "translateX(-50%)";
            el.style.bottom = "0px";

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

            el.appendChild(doors);
            el.appendChild(badge);
            el.appendChild(status);

            lift.dom.element = el;
            lift.dom.statusChip = status;

            shaft.appendChild(el);
        });
    },

    // ---------------------------------
    // MOVEMENT
    // ---------------------------------

    positionLiftsAtGround() {
        AppState.lifts.forEach(lift => {
            const el = lift.dom.element;
            el.style.transition = "none";
            el.style.bottom = "0px";
            void el.offsetHeight;
            el.style.transition = "";
        });
    },

    animateLift(id, targetFloor, duration) {
        const el = document.getElementById(`lift-${id}`);
        if (!el) return;

        const bottom = targetFloor * AppState.floorHeight;

        console.log(`Lift ${id} moving to`, bottom, "px");

        el.style.transition = `bottom ${duration}ms linear`;
        el.style.bottom = `${bottom}px`;
    },

    setDoorState(id, open) {
        const el = document.getElementById(`lift-${id}`);
        if (!el) return;
        if (open) el.classList.add("doors-open");
        else el.classList.remove("doors-open");
    },

    setLiftStatus(lift, status) {
        if (lift.dom.statusChip) lift.dom.statusChip.textContent = status;
    },

    markCallButton(floor, dir, active) {
        const btn = document.getElementById(`call-btn-${floor}-${dir}`);
        if (!btn) return;
        if (active) btn.classList.add("active");
        else btn.classList.remove("active");
    },

    // ---------------------------------
    // LIFT PANELS
    // ---------------------------------

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
        lift.dom.panelDirection.textContent =
            lift.direction === "idle" ? "Idle" :
            lift.direction === "up" ? "Up" : "Down";

        lift.dom.panelQueue.textContent =
            lift.queue.length ? lift.queue.join(", ") : "–";

        const dot = lift.dom.panelDot;
        dot.className = "lift-panel-dot";
        dot.classList.add(
            lift.direction === "idle" ? "idle" :
            lift.direction === "up" ? "up" : "down"
        );
    },

    // ---------------------------------
    // CALL LIST
    // ---------------------------------

    updateCallQueueList() {
        const list = document.getElementById("callQueue");
        list.innerHTML = "";

        if (AppState.activeCalls.size === 0) {
            list.innerHTML = "<li>No pending requests</li>";
            return;
        }

        const sorted = Array.from(AppState.activeCalls.values()).sort(
            (a, b) => a.createdAt - b.createdAt
        );

        sorted.forEach(call => {
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
//   START / RESET
// =========================

function startSimulation() {
    const floors = Number(document.getElementById("numFloors").value);
    const lifts = Number(document.getElementById("numLifts").value);

    let error = false;

    if (floors < 1 || floors > 20) {
        document.getElementById("floorsError").textContent = "Enter 1–20 floors";
        error = true;
    } else {
        document.getElementById("floorsError").textContent = "";
    }

    if (lifts < 1 || lifts > 10) {
        document.getElementById("liftsError").textContent = "Enter 1–10 lifts";
        error = true;
    } else {
        document.getElementById("liftsError").textContent = "";
    }

    if (error) return;

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
    document.getElementById("startBtn").onclick = startSimulation;
    document.getElementById("resetBtn").onclick = resetSimulation;
});
