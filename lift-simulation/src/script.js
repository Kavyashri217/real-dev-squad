let floors = 7;
let lifts = 3;
let speed = 800;

let liftObjects = [];
let queue = [];

document.getElementById("startBtn").addEventListener("click", () => {
    floors = parseInt(floorCount.value);
    lifts = parseInt(liftCount.value);
    speed = parseInt(liftSpeed.value);

    buildUI();
});

document.getElementById("randomCallBtn").addEventListener("click", () => {
    const rand = Math.floor(Math.random() * floors);
    handleCall(rand);
});

document.getElementById("clearBtn").addEventListener("click", () => {
    queue = [];
    updateQueueList();
});

function buildUI() {
    const building = document.getElementById("building");
    building.innerHTML = "";
    liftObjects = [];

    // Create floors
    for (let i = floors - 1; i >= 0; i--) {
        const floorEl = document.createElement("div");
        floorEl.className = "floor";

        let buttons = "";

        // Top floor → only DOWN button
        if (i === floors - 1) {
            buttons = `<button class="call-btn down" onclick="handleCall(${i})"></button>`;
        }
        // Ground floor → only UP button
        else if (i === 0) {
            buttons = `<button class="call-btn up" onclick="handleCall(${i})"></button>`;
        }
        // Middle floors → both buttons
        else {
            buttons = `
                <button class="call-btn up" onclick="handleCall(${i})"></button>
                <button class="call-btn down" onclick="handleCall(${i})"></button>
            `;
        }

        floorEl.innerHTML = `
            <div class="floor-number">${i}</div>
            <div class="button-group">${buttons}</div>
            <div class="lift-section"></div>
        `;

        building.appendChild(floorEl);
    }

    // Add lifts — ALL AT GROUND FLOOR
    const firstLiftSection = document.querySelector(".lift-section");

    for (let i = 0; i < lifts; i++) {
        const shaft = document.createElement("div");
        shaft.className = "lift-shaft";

        const lift = document.createElement("div");
        lift.className = "lift";

        // Every lift starts at ground floor
        lift.dataset.floor = 0;
        lift.style.transform = "translateY(0px)";

        lift.innerHTML = `
            <div class="door left"></div>
            <div class="door right"></div>
        `;

        shaft.appendChild(lift);
        firstLiftSection.appendChild(shaft);

        liftObjects.push({
            element: lift,
            currentFloor: 0,
            busy: false
        });
    }
}

function handleCall(floor) {
    queue.push(floor);
    updateQueueList();
    processQueue();
}

function updateQueueList() {
    const q = document.getElementById("queueList");
    q.innerHTML = queue.map(f => `<li>Floor ${f}</li>`).join("");
}

function processQueue() {
    if (queue.length === 0) return;

    const floor = queue.shift();
    updateQueueList();
    assignLift(floor);
}

function assignLift(target) {
    let best = null;
    let minDist = Infinity;

    liftObjects.forEach(lift => {
        if (lift.busy) return;

        const dist = Math.abs(lift.currentFloor - target);
        if (dist < minDist) {
            minDist = dist;
            best = lift;
        }
    });

    if (!best) {
        queue.unshift(target);
        return;
    }

    moveLift(best, target);
}

function moveLift(lift, target) {
    lift.busy = true;

    const floorHeight = 120;
    const translateY = target * -floorHeight;

    const time = Math.abs(lift.currentFloor - target) * speed;

    lift.element.style.transition = `transform ${time}ms ease-in-out`;
    lift.element.style.transform = `translateY(${translateY}px)`;

    setTimeout(() => {
        lift.currentFloor = target;
        openDoors(lift);
    }, time);
}

function openDoors(lift) {
    lift.element.classList.add("open");

    setTimeout(() => {
        lift.element.classList.remove("open");
        lift.busy = false;
        processQueue();
    }, 1500);
}