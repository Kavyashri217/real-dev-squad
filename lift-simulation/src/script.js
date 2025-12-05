// Data Store - Central state management
const AppState = {
    numFloors: 0,
    numLifts: 0,
    lifts: [],
    floorCalls: new Map(), // Changed to Map to store direction
    
    init(floors, lifts) {
        this.numFloors = floors;
        this.numLifts = lifts;
        this.lifts = [];
        this.floorCalls = new Map();
        
        for (let i = 0; i < lifts; i++) {
            this.lifts.push({
                id: i,
                currentFloor: 0,
                targetFloors: [],
                isMoving: false,
                doorsOpen: false
            });
        }
    }
};

// Lift Controller - Engine that manages lift logic
const LiftController = {
    DOOR_TIME: 2500, // 2.5 seconds per door operation
    FLOOR_TIME: 2000, // 2 seconds per floor
    
    callLift(floor, direction) {
        const callKey = `${floor}-${direction}`;
        
        if (AppState.floorCalls.has(callKey)) {
            return; // Already called
        }
        
        AppState.floorCalls.set(callKey, direction);
        UI.updateCallButton(floor, direction, true);
        
        const bestLift = this.findBestLift(floor);
        if (bestLift !== null) {
            this.assignLift(bestLift, floor);
        }
    },
    
    findBestLift(targetFloor) {
        let bestLift = null;
        let minCost = Infinity;
        
        AppState.lifts.forEach((lift, index) => {
            if (!lift.isMoving && lift.targetFloors.length === 0) {
                const distance = Math.abs(lift.currentFloor - targetFloor);
                if (distance < minCost) {
                    minCost = distance;
                    bestLift = index;
                }
            }
        });
        
        // If no idle lift, find one with least queue
        if (bestLift === null) {
            let minQueue = Infinity;
            AppState.lifts.forEach((lift, index) => {
                if (lift.targetFloors.length < minQueue) {
                    minQueue = lift.targetFloors.length;
                    bestLift = index;
                }
            });
        }
        
        return bestLift;
    },
    
    assignLift(liftIndex, floor) {
        const lift = AppState.lifts[liftIndex];
        
        if (!lift.targetFloors.includes(floor)) {
            lift.targetFloors.push(floor);
            lift.targetFloors.sort((a, b) => {
                // Sort based on direction of travel
                if (lift.currentFloor < floor) {
                    return a - b; // Going up
                } else {
                    return b - a; // Going down
                }
            });
        }
        
        if (!lift.isMoving) {
            this.startLiftMovement(liftIndex);
        }
    },
    
    async startLiftMovement(liftIndex) {
        const lift = AppState.lifts[liftIndex];
        
        while (lift.targetFloors.length > 0) {
            lift.isMoving = true;
            const targetFloor = lift.targetFloors[0];
            
            await this.moveLiftToFloor(liftIndex, targetFloor);
            await this.operateDoors(liftIndex);
            
            // Remove all calls for this floor
            const keysToDelete = [];
            AppState.floorCalls.forEach((direction, key) => {
                if (key.startsWith(`${targetFloor}-`)) {
                    keysToDelete.push(key);
                }
            });
            keysToDelete.forEach(key => {
                const direction = key.split('-')[1];
                AppState.floorCalls.delete(key);
                UI.updateCallButton(targetFloor, direction, false);
            });
            
            lift.targetFloors.shift();
        }
        
        lift.isMoving = false;
        UI.updateLiftStatus(liftIndex, 'Idle');
    },
    
    async moveLiftToFloor(liftIndex, targetFloor) {
        const lift = AppState.lifts[liftIndex];
        const floorsToTravel = Math.abs(targetFloor - lift.currentFloor);
        
        if (floorsToTravel === 0) return;
        
        const travelTime = floorsToTravel * this.FLOOR_TIME;
        const direction = targetFloor > lift.currentFloor ? 'up' : 'down';
        
        UI.updateLiftStatus(liftIndex, `Moving ${direction}`);
        UI.animateLift(liftIndex, targetFloor, travelTime);
        
        await this.wait(travelTime);
        lift.currentFloor = targetFloor;
    },
    
    async operateDoors(liftIndex) {
        const lift = AppState.lifts[liftIndex];
        
        // Open doors
        UI.updateLiftStatus(liftIndex, 'Opening');
        lift.doorsOpen = true;
        UI.setDoorState(liftIndex, true);
        await this.wait(this.DOOR_TIME);
        
        // Close doors
        UI.updateLiftStatus(liftIndex, 'Closing');
        lift.doorsOpen = false;
        UI.setDoorState(liftIndex, false);
        await this.wait(this.DOOR_TIME);
    },
    
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};

// UI Controller - Handles all visual updates
const UI = {
    init() {
        const building = document.getElementById('building');
        building.innerHTML = '';
        
        // Create floors from top to bottom
        for (let floor = AppState.numFloors - 1; floor >= 0; floor--) {
            const floorDiv = document.createElement('div');
            floorDiv.className = 'floor';
            floorDiv.id = `floor-${floor}`;
            
            // Floor number
            const floorNumber = document.createElement('div');
            floorNumber.className = 'floor-number';
            floorNumber.textContent = `Floor ${floor}`;
            
            // Call buttons
            const callBtnsContainer = document.createElement('div');
            callBtnsContainer.style.display = 'flex';
            callBtnsContainer.style.flexDirection = 'column';
            callBtnsContainer.style.gap = '10px';
            
            // Show UP button for all floors except the top floor
            if (floor < AppState.numFloors - 1) {
                const upBtn = document.createElement('button');
                upBtn.className = 'call-button';
                upBtn.id = `call-btn-${floor}-up`;
                upBtn.textContent = '↑';
                upBtn.onclick = () => LiftController.callLift(floor, 'up');
                callBtnsContainer.appendChild(upBtn);
            }
            
            // Show DOWN button for all floors except ground floor
            if (floor > 0) {
                const downBtn = document.createElement('button');
                downBtn.className = 'call-button';
                downBtn.id = `call-btn-${floor}-down`;
                downBtn.textContent = '↓';
                downBtn.onclick = () => LiftController.callLift(floor, 'down');
                callBtnsContainer.appendChild(downBtn);
            }
            
            // Lifts area
            const liftsArea = document.createElement('div');
            liftsArea.className = 'lifts-area';
            
            floorDiv.appendChild(floorNumber);
            floorDiv.appendChild(callBtnsContainer);
            floorDiv.appendChild(liftsArea);
            building.appendChild(floorDiv);
        }
        
        // Create lift shafts
        const firstFloor = document.querySelector('.lifts-area');
        for (let i = 0; i < AppState.numLifts; i++) {
            const shaft = document.createElement('div');
            shaft.className = 'lift-shaft';
            
            const lift = document.createElement('div');
            lift.className = 'lift';
            lift.id = `lift-${i}`;
            
            const liftNumber = document.createElement('div');
            liftNumber.className = 'lift-number';
            liftNumber.textContent = `L${i + 1}`;
            
            const liftStatus = document.createElement('div');
            liftStatus.className = 'lift-status';
            liftStatus.id = `lift-status-${i}`;
            liftStatus.textContent = 'Idle';
            
            const doors = document.createElement('div');
            doors.className = 'lift-doors';
            
            const leftDoor = document.createElement('div');
            leftDoor.className = 'lift-door left';
            
            const rightDoor = document.createElement('div');
            rightDoor.className = 'lift-door right';
            
            doors.appendChild(leftDoor);
            doors.appendChild(rightDoor);
            
            lift.appendChild(doors);
            lift.appendChild(liftNumber);
            lift.appendChild(liftStatus);
            shaft.appendChild(lift);
            firstFloor.appendChild(shaft);
        }
    },
    
    animateLift(liftIndex, targetFloor, duration) {
        const lift = document.getElementById(`lift-${liftIndex}`);
        const floorHeight = 120; // Matches CSS min-height
        const position = targetFloor * floorHeight;
        
        lift.style.transition = `bottom ${duration}ms linear`;
        lift.style.bottom = `${position}px`;
    },
    
    setInitialLiftPositions() {
        // Force all lifts to floor 0 initially with no transition
        AppState.lifts.forEach((lift, index) => {
            const liftEl = document.getElementById(`lift-${index}`);
            if (liftEl) {
                // Force reflow to ensure no transition
                liftEl.style.transition = 'none';
                liftEl.offsetHeight; // Force reflow
                liftEl.style.bottom = '0px';
                // Re-enable transitions after a small delay
                setTimeout(() => {
                    liftEl.style.transition = '';
                }, 50);
            }
        });
    },
    
    setDoorState(liftIndex, open) {
        const lift = document.getElementById(`lift-${liftIndex}`);
        if (open) {
            lift.classList.add('doors-open');
        } else {
            lift.classList.remove('doors-open');
        }
    },
    
    updateLiftStatus(liftIndex, status) {
        const statusEl = document.getElementById(`lift-status-${liftIndex}`);
        if (statusEl) {
            statusEl.textContent = status;
        }
    },
    
    updateCallButton(floor, direction, active) {
        const btn = document.getElementById(`call-btn-${floor}-${direction}`);
        if (btn) {
            if (active) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    }
};

// Application Control Functions
function startSimulation() {
    const numFloors = parseInt(document.getElementById('numFloors').value);
    const numLifts = parseInt(document.getElementById('numLifts').value);
    
    // Validation
    let hasError = false;
    
    if (numFloors < 1 || numFloors > 20) {
        document.getElementById('floorsError').textContent = 'Please enter 1-20 floors';
        hasError = true;
    } else {
        document.getElementById('floorsError').textContent = '';
    }
    
    if (numLifts < 1 || numLifts > 10) {
        document.getElementById('liftsError').textContent = 'Please enter 1-10 lifts';
        hasError = true;
    } else {
        document.getElementById('liftsError').textContent = '';
    }
    
    if (hasError) return;
    
    // Initialize application
    AppState.init(numFloors, numLifts);
    UI.init();
    UI.setInitialLiftPositions();
    
    // Show simulation screen
    document.getElementById('configScreen').style.display = 'none';
    document.getElementById('simulationScreen').style.display = 'block';
}

function resetSimulation() {
    document.getElementById('simulationScreen').style.display = 'none';
    document.getElementById('configScreen').style.display = 'block';
}