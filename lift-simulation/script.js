// --- CENTRAL APP STATE ------------------------------------------------------

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

// --- LIFT LOGIC -------------------------------------------------------------

const LiftController = {
    FLOOR_TRAVEL_TIME: 1500,
    DOOR_TIME: 1800,

    requestPickup(floor, direction) {
        const key = `${floor}-${direction}`;
        if (AppState.activeCalls.has(key)) return;

        const call = { floor, direction, createdAt: Date.now() };
        AppState.activeCalls.set(key, call);

        UI.markCallButton(floor, direction, true);
        UI.updateCallQueueList();

        const best = this.findBestLift(call);
        if (best === null) return;

        this.assignCall(AppState.lifts[best], call);
    },

    findBestLift(call) {
        let best = null;
        let bestScore = Infinity;

        AppState.lifts.forEach((lift, index) => {
            const lastStop = lift.queue.length
                ? lift.queue[lift.queue.length - 1]
                : lift.currentFloor;

            const distance = Math.abs(lastStop - call.floor);
            const queuePenalty = lift.queue.length * 0.8;

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
                best = index;
            }
        });

        return best;
    },

    assignCall(lift, call) {
        if (!lift.queue.includes(call.floor)) {
            lift.queue.push(call.floor);
        }

        lift.queue.sort((a, b) => a - b);
        if (lift.direction === "down") lift.queue.sort((a, b) => b - a);

        UI.updateLiftPanel(lift);

        if (!lift.processing) this.process(lift);
    },

    async process(lift) {
        lift.processing = true;

        while (lift.queue.length > 0) {
            const target = lift.queue.shift();

            lift.direction =
                target > lift.currentFloor ? "up" :
                target < lift.currentFloor ? "down" : "idle";

            UI.updateLiftPanel(lift);

            await this.moveTo(lift, target);
            await this.doors(lift);

            this.clearCalls(target);
        }

        lift.direction = "idle";
        lift.processing = false;

        UI.setLiftStatus(lift, "Idle");
        UI.updateLiftPanel(lift);
    },

    async moveTo(lift, targetFloor) {
        const dist = Math.abs(targetFloor - lift.currentFloor);
        if (dist === 0) return;

        const duration = dist * this.FLOOR_TRAVEL_TIME;
        const dirLabel = targetFloor > lift.currentFloor ? "up" : "down";

        UI.setLiftStatus(lift, `Moving ${dirLabel}`);
        UI.animateLift(lift.id, targetFloor, duration);
        UI.updateLiftPanel(lift);

        await this.wait(duration);

        lift.currentFloor = targetFloor;
        UI.updateLiftPanel(lift);
    },

    async doors(lift) {
        UI.setLiftStatus(lift, "Doors opening");
        UI.setDoorState(lift.id, true);
        UI.updateLiftPanel(lift);

        await this.wait(this.DOOR_TIME);

        UI.setLiftStatus(lift, "Doors closing");
        UI.setDoorState(lift.id, false);
        UI.updateLiftPanel(lift);

        await this.wait(this.DOOR_TIME);
    },

    clearCalls(floor) {
        const removes = [];
        for (const [k, c] of AppState.activeCalls.entries()) {
            if (c.floor === floor) {
                removes.push(k);
                UI.markCallButton(c.floor, c.direction, false);
            }
        }
        removes.forEach((k) => AppState.activeCalls.delete(k));
        UI.updateCallQueueList();
    },

    wait(ms) {
        return new Promise((res) => setTimeout(res, ms));
    }
};

// --- UI LAYER ---------------------------------------------------------------

const UI = {
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
                const up = document.createElement("button");
                up.className = "call-button";
                up.textContent = "▲";
                up.id = `call-btn-${floor}-up`;
                up.onclick = () => LiftController.requestPickup(floor, "up");
                actions.appendChild(up);
            }

            if (floor > 0) {
                const down = document.createElement("button");
                down.className = "call-button";
                down.textContent = "▼";
                down.id = `call-btn-${floor}-down`;
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

        this.createFullHeightShaft();
        this.captureFloorHeight();
        this.positionLiftsAtGround();
    },

    createFullHeightShaft() {
        const building = document.getElementById("building");

        const shaft = document.createElement("div");
        shaft.className = "lift-shaft";
        shaft.style.position = "absolute";
        shaft.style.top = "0";
        shaft.style.bottom = "0";
        shaft.style.left = "160px"; 
        shaft.style.width = "80px";
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

            const left = document.createElement("div");
            left.className = "lift-door left";

            const right = document.createElement("div");
            right.className = "lift-door right";

            doors.appendChild(left);
            doors.appendChild(right);

            liftEl.appendChild(doors);
            liftEl.appendChild(badge);
            liftEl.appendChild(status);

            lift.dom.element = liftEl;
            lift.dom.statusChip = status;

            shaft.appendChild(liftEl);
        });
    },

    captureFloorHeight() {
        const floor = document.querySelector(".floor");
        if (!floor) return;

        AppState.floorHeight = floor.offsetHeight;
        console.log("Floor height:", AppState.floorHeight);
    },

    positionLiftsAtGround() {
        AppState.lifts.forEach((lift) => {
            const el = lift.dom.element;
            if (!el) return;

            el.style.transition = "none";
            el.style.bottom = "0px";
            void el.offsetHeight;
            el.style.transition = "";
        });
    },

    animateLift(id, targetFloor, duration) {
        const el = document.getElementById(`lift-${id}`);
        if (!el) return;

        const y = targetFloor * AppState.floorHeight;

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

        if (active) btn.classList.add("active");
        else btn.classList.remove("active");
    },

    // --- SIDE PANEL ---

    initLiftPanels() {
        const container = document.getElementById("liftPanels");
        container.innerHTML = "";

        AppState.lifts.forEach((lift) => {
            const panel = document.createElement("div");
            panel.className = "lift-panel";

            const header = document.createElement("div");
            header.className = "lift-panel-header";

            const title = document.createElement("span");
            title.className = "lift-panel-title";
            title.textContent = `Lift ${lift.id + 1}`;

            const dot = document.createElement("span");
            dot.className = "lift-panel-dot idle";

            header.appendChild(title);
            header.appendChild(dot);

            const body = document.createElement("div");
            body.className = "lift-panel-body";

            const fL = document.createElement("span");
            fL.textContent = "Floor";

            const fV = document.createElement("span");

            const dL = document.createElement("span");
            dL.textContent = "Direction";

            const dV = document.createElement("span");

            const qL = document.createElement("span");
            qL.textContent = "Queue";

            const qV = document.createElement("span");

            body.append(fL, fV, dL, dV, qL, qV);
            panel.append(header, body);
            container.appendChild(panel);

            lift.dom.panel = panel;
            lift.dom.panelDot = dot;
            lift.dom.panelFloor = fV;
            lift.dom.panelDirection = dV;
            lift.dom.panelQueue = qV;

            this.updateLiftPanel(lift);
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
            lift.direction === "up"
                ? "up"
                : lift.direction === "down"
                    ? "down"
                    : "idle"
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

        const sorted = [...AppState.activeCalls.values()].sort(
            (a, b) => a.createdAt - b.createdAt
        );

        for (const call of sorted) {
            const li = document.createElement("li");

            const name = document.createElement("span");
            name.textContent = `Floor ${call.floor}`;

            const tag = document.createElement("span");
            tag.className = "call-tag";
            tag.textContent = call.direction.toUpperCase();

            li.append(name, tag);
            list.appendChild(li);
        }
    }
};

// --- APP BOOTSTRAP ----------------------------------------------------------

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
    document.getElementById("simulationScreen").style.display = "none";
    document.getElementById("configScreen").style.display = "block";

    document.getElementById("building").innerHTML = "";
    document.getElementById("liftPanels").innerHTML = "";
    document.getElementById("callQueue").innerHTML = "";

    AppState.activeCalls.clear();
    AppState.lifts = [];
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("startBtn").onclick = startSimulation;
    document.getElementById("resetBtn").onclick = resetSimulation;
});
