// --- CENTRAL APP STATE ------------------------------------------------------

const AppState = {
    numFloors: 0,
    numLifts: 0,
    lifts: [],        // array of lift objects
    activeCalls: new Map(), // key: "floor-direction" -> { floor, direction, createdAt }
    floorHeight: 0    // pixel height of each floor row (computed after render)
};

// Lift factory
function createLift(id) {
    return {
        id,
        currentFloor: 0,
        queue: [],
        isMoving: false,
        direction: "idle", // 'up' | 'down' | 'idle'
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

// --- LIFT CONTROLLER (LOGIC) -----------------------------------------------

const LiftController = {
    FLOOR_TRAVEL_TIME: 1500, // per floor ms
    DOOR_TIME: 1800,         // doors open or close ms

    // User clicks call button
    requestPickup(floor, direction) {
        const key = `${floor}-${direction}`;
        if (AppState.activeCalls.has(key)) {
            return; // already in queue
        }

        const call = { floor, direction, createdAt: Date.now() };
        AppState.activeCalls.set(key, call);

        UI.markCallButton(floor, direction, true);
        UI.updateCallQueueList();

        const bestLiftIndex = this.findBestLiftForCall(call);
        if (bestLiftIndex === null) return;

        const lift = AppState.lifts[bestLiftIndex];
        this.assignCallToLift(lift, call);
    },

    // Choose the lift with minimum "cost" to serve this request
    findBestLiftForCall(call) {
        if (!AppState.lifts.length) return null;

        let bestIndex = null;
        let bestScore = Infinity;

        AppState.lifts.forEach((lift, index) => {
            const lastStop = lift.queue.length
                ? lift.queue[lift.queue.length - 1]
                : lift.currentFloor;

            const distance = Math.abs(lastStop - call.floor);

            // small penalty for existing queue so busy lifts are less preferred
            const queuePenalty = lift.queue.length * 0.8;

            // favour lifts that are already going in the same direction & in path
            let directionBonus = 0;
            if (lift.direction === call.direction && lift.direction !== "idle") {
                if (
                    (call.direction === "up" && call.floor >= lift.currentFloor) ||
                    (call.direction === "down" && call.floor <= lift.currentFloor)
                ) {
                    directionBonus = -1.5;
                }
            }

            const score = distance + queuePenalty + directionBonus;

            if (score < bestScore) {
                bestScore = score;
                bestIndex = index;
            }
        });

        return bestIndex;
    },

    assignCallToLift(lift, call) {
        if (!lift.queue.includes(call.floor)) {
            lift.queue.push(call.floor);
        }

        // Sort queue in direction of travel or relative to current floor
        lift.queue.sort((a, b) => a - b);

        if (lift.direction === "down") {
            lift.queue.sort((a, b) => b - a);
        }

        UI.updateLiftPanel(lift);
        UI.updateCallQueueList();

        if (!lift.processing) {
            this.processLiftQueue(lift);
        }
    },

    async processLiftQueue(lift) {
        lift.processing = true;

        while (lift.queue.length > 0) {
            const targetFloor = lift.queue.shift();

            // decide direction based on target
            if (targetFloor > lift.currentFloor) {
                lift.direction = "up";
            } else if (targetFloor < lift.currentFloor) {
                lift.direction = "down";
            } else {
                lift.direction = "idle";
            }

            UI.updateLiftPanel(lift);
            await this.moveLift(lift, targetFloor);
            await this.operateDoors(lift);

            // clear any calls for this floor that are now served
            this.clearFloorCalls(targetFloor);
        }

        lift.direction = "idle";
        lift.isMoving = false;
        lift.processing = false;
        UI.setLiftStatus(lift, "Idle");
        UI.updateLiftPanel(lift);
    },

    async moveLift(lift, targetFloor) {
        const distanceFloors = Math.abs(targetFloor - lift.currentFloor);
        if (distanceFloors === 0) return;

        const directionLabel = targetFloor > lift.currentFloor ? "Up" : "Down";
        const duration = distanceFloors * this.FLOOR_TRAVEL_TIME;

        lift.isMoving = true;
        UI.setLiftStatus(lift, `Moving ${directionLabel.toLowerCase()}`);
        UI.animateLift(lift.id, targetFloor, duration);
        UI.updateLiftPanel(lift);

        await this.wait(duration);
        lift.currentFloor = targetFloor;
        UI.updateLiftPanel(lift);
    },

    async operateDoors(lift) {
        // open
        UI.setLiftStatus(lift, "Doors opening");
        UI.setDoorState(lift.id, true);
        UI.updateLiftPanel(lift);
        await this.wait(this.DOOR_TIME);

        // close
        UI.setLiftStatus(lift, "Doors closing");
        UI.setDoorState(lift.id, false);
        UI.updateLiftPanel(lift);
        await this.wait(this.DOOR_TIME);
    },

    clearFloorCalls(floor) {
        const toDelete = [];
        for (const [key, call] of AppState.activeCalls.entries()) {
            if (call.floor === floor) {
                toDelete.push(key);
                UI.markCallButton(call.floor, call.direction, false);
            }
        }
        toDelete.forEach((k) => AppState.activeCalls.delete(k));
        UI.updateCallQueueList();
    },

    wait(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
};

// --- UI LAYER ---------------------------------------------------------------

const UI = {
    initBuilding() {
        const buildingEl = document.getElementById("building");
        buildingEl.innerHTML = "";

        // create floors from 0 upwards but visually reversed with flex-column-reverse
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
                upBtn.textContent = "▲";
                upBtn.id = `call-btn-${floor}-up`;
                upBtn.addEventListener("click", () =>
                    LiftController.requestPickup(floor, "up")
                );
                actions.appendChild(upBtn);
            }

            if (floor > 0) {
                const downBtn = document.createElement("button");
                downBtn.className = "call-button";
                downBtn.textContent = "▼";
                downBtn.id = `call-btn-${floor}-down`;
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
            buildingEl.appendChild(floorEl);
        }

        this.attachLifts();
        this.captureFloorHeight();
        this.positionLiftsAtGround();
    },

    attachLifts() {
        const firstLiftsArea = document.querySelector(".lifts-area");
        if (!firstLiftsArea) return;

        // Create a single shaft region that spans vertically, lifts absolutely positioned
        const shaft = document.createElement("div");
        shaft.className = "lift-shaft";

        firstLiftsArea.appendChild(shaft);

        AppState.lifts.forEach((lift) => {
            const liftEl = document.createElement("div");
            liftEl.className = "lift";
            liftEl.id = `lift-${lift.id}`;

            const badge = document.createElement("div");
            badge.className = "lift-badge";
            badge.textContent = `L${lift.id + 1}`;

            const statusChip = document.createElement("div");
            statusChip.className = "lift-status-chip";
            statusChip.id = `lift-status-${lift.id}`;
            statusChip.textContent = "Idle";

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
            liftEl.appendChild(statusChip);

            shaft.appendChild(liftEl);

            // store DOM refs
            lift.dom.element = liftEl;
            lift.dom.statusChip = statusChip;
        });
    },

    captureFloorHeight() {
        const anyFloor = document.querySelector(".floor");
        if (!anyFloor) return;
        const rect = anyFloor.getBoundingClientRect();
        AppState.floorHeight = rect.height + 4; // include gap
    },

    positionLiftsAtGround() {
        AppState.lifts.forEach((lift) => {
            const el = lift.dom.element;
            if (!el) return;
            el.style.transition = "none";
            el.style.bottom = "0px";

            // force reflow then enable transition for moves
            void el.offsetHeight;
            el.style.transition = "";
        });
    },

    animateLift(liftId, targetFloor, duration) {
        const liftEl = document.getElementById(`lift-${liftId}`);
        if (!liftEl) return;
        const h = AppState.floorHeight || 60;
        const position = targetFloor * h;

        liftEl.style.transition = `bottom ${duration}ms linear`;
        liftEl.style.bottom = `${position}px`;
    },

    setDoorState(liftId, open) {
        const liftEl = document.getElementById(`lift-${liftId}`);
        if (!liftEl) return;
        if (open) {
            liftEl.classList.add("doors-open");
        } else {
            liftEl.classList.remove("doors-open");
        }
    },

    setLiftStatus(lift, statusText) {
        if (lift.dom.statusChip) {
            lift.dom.statusChip.textContent = statusText;
        }
    },

    markCallButton(floor, direction, active) {
        const btn = document.getElementById(`call-btn-${floor}-${direction}`);
        if (!btn) return;
        if (active) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    },

    updateCallQueueList() {
        const list = document.getElementById("callQueue");
        if (!list) return;

        list.innerHTML = "";
        if (AppState.activeCalls.size === 0) {
            const li = document.createElement("li");
            li.textContent = "No pending requests";
            list.appendChild(li);
            return;
        }

        const sorted = Array.from(AppState.activeCalls.values()).sort(
            (a, b) => a.createdAt - b.createdAt
        );

        sorted.forEach((call) => {
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
    },

    initLiftPanels() {
        const container = document.getElementById("liftPanels");
        container.innerHTML = "";

        AppState.lifts.forEach((lift) => {
            const panel = document.createElement("div");
            panel.className = "lift-panel";

            const header = document.createElement("div");
            header.className = "lift-panel-header";

            const title = document.createElement("div");
            title.className = "lift-panel-title";
            title.textContent = `Lift ${lift.id + 1}`;

            const dot = document.createElement("span");
            dot.className = "lift-panel-dot idle";

            header.appendChild(title);
            header.appendChild(dot);

            const body = document.createElement("div");
            body.className = "lift-panel-body";

            const floorLabel = document.createElement("span");
            floorLabel.textContent = "Floor";
            const floorValue = document.createElement("span");

            const dirLabel = document.createElement("span");
            dirLabel.textContent = "Direction";
            const dirValue = document.createElement("span");

            const queueLabel = document.createElement("span");
            queueLabel.textContent = "Queue";
            const queueValue = document.createElement("span");

            body.appendChild(floorLabel);
            body.appendChild(floorValue);
            body.appendChild(dirLabel);
            body.appendChild(dirValue);
            body.appendChild(queueLabel);
            body.appendChild(queueValue);

            panel.appendChild(header);
            panel.appendChild(body);
            container.appendChild(panel);

            // connect to lift
            lift.dom.panel = panel;
            lift.dom.panelDot = dot;
            lift.dom.panelFloor = floorValue;
            lift.dom.panelDirection = dirValue;
            lift.dom.panelQueue = queueValue;

            this.updateLiftPanel(lift);
        });
    },

    updateLiftPanel(lift) {
        if (!lift.dom.panel) return;

        if (lift.dom.panelFloor) {
            lift.dom.panelFloor.textContent = lift.currentFloor;
        }

        if (lift.dom.panelDirection) {
            const dir = lift.direction;
            lift.dom.panelDirection.textContent = dir === "idle"
                ? "Idle"
                : dir === "up"
                    ? "Up"
                    : "Down";
        }

        if (lift.dom.panelQueue) {
            lift.dom.panelQueue.textContent = lift.queue.length
                ? lift.queue.join(", ")
                : "–";
        }

        if (lift.dom.panelDot) {
            lift.dom.panelDot.className = "lift-panel-dot";
            if (lift.direction === "up") {
                lift.dom.panelDot.classList.add("up");
            } else if (lift.direction === "down") {
                lift.dom.panelDot.classList.add("down");
            } else {
                lift.dom.panelDot.classList.add("idle");
            }
        }
    }
};

// --- APP LIFECYCLE ---------------------------------------------------------

function startSimulation() {
    const floors = parseInt(document.getElementById("numFloors").value, 10);
    const liftsCount = parseInt(document.getElementById("numLifts").value, 10);

    let hasError = false;

    if (Number.isNaN(floors) || floors < 1 || floors > 20) {
        document.getElementById("floorsError").textContent =
            "Please enter 1–20 floors";
        hasError = true;
    } else {
        document.getElementById("floorsError").textContent = "";
    }

    if (Number.isNaN(liftsCount) || liftsCount < 1 || liftsCount > 10) {
        document.getElementById("liftsError").textContent =
            "Please enter 1–10 lifts";
        hasError = true;
    } else {
        document.getElementById("liftsError").textContent = "";
    }

    if (hasError) return;

    // initialise state
    AppState.numFloors = floors;
    AppState.numLifts = liftsCount;
    AppState.lifts = [];
    AppState.activeCalls.clear();

    for (let i = 0; i < liftsCount; i++) {
        AppState.lifts.push(createLift(i));
    }

    // meta badges
    document.getElementById("metaFloors").textContent = floors;
    document.getElementById("metaLifts").textContent = liftsCount;

    // build UI
    UI.initBuilding();
    UI.initLiftPanels();
    UI.updateCallQueueList();

    // screen switch
    document.getElementById("configScreen").style.display = "none";
    document.getElementById("simulationScreen").style.display = "block";
}

function resetSimulation() {
    // basic reset: go back to config and clear simulation DOM
    const building = document.getElementById("building");
    const queue = document.getElementById("callQueue");
    const panels = document.getElementById("liftPanels");

    if (building) building.innerHTML = "";
    if (queue) queue.innerHTML = "";
    if (panels) panels.innerHTML = "";

    AppState.lifts = [];
    AppState.activeCalls.clear();

    document.getElementById("simulationScreen").style.display = "none";
    document.getElementById("configScreen").style.display = "block";
}

// --- EVENT WIRING ----------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
    const startBtn = document.getElementById("startBtn");
    const resetBtn = document.getElementById("resetBtn");

    if (startBtn) startBtn.addEventListener("click", startSimulation);
    if (resetBtn) resetBtn.addEventListener("click", resetSimulation);
});
