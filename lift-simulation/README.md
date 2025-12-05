# Lift Simulator

An interactive web application that simulates realistic lift (elevator) mechanics with visual animations and smart dispatch algorithms.

## Features

### Milestone 1: Core Architecture
- **Data Store**: Centralized state management (`AppState`) tracking floors, lifts, and calls
- **JS Engine**: Smart controller (`LiftController`) that manages lift dispatch and movement
- **UI Controller**: Visual interface that responds to controller commands

### Milestone 2: Realistic Mechanics
- **Door Operations**: Doors open and close in 2.5 seconds each with smooth animations
- **Movement Speed**: Lifts travel at 2 seconds per floor
- **Queue System**: Lifts stop at every called floor in their queue
- **Mobile Friendly**: Responsive design that works on all devices

### Additional Features
- **Smart Dispatch Algorithm**: Finds the nearest idle lift or assigns to shortest queue
- **Realistic Visual Design**: Metallic elevator cars with detailed doors and panels
- **Direction Buttons**: Up/down buttons on appropriate floors
- **Status Indicators**: Real-time lift status (Idle, Moving, Opening, Closing)
- **Call Button Feedback**: Visual feedback when floors are called

## Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd lift-simulator
```

2. Install dependencies (optional, for live-server):
```bash
npm install
```

## Usage

### Option 1: Direct Open
Simply open `index.html` in your web browser.

### Option 2: Using Live Server
```bash
npm start
```
Then visit `http://localhost:3000` in your browser.

## How to Use

1. **Configure Simulation**:
   - Enter number of floors (1-20)
   - Enter number of lifts (1-10)
   - Click "Start Simulation"

2. **Call Lifts**:
   - Click ↑ button to call a lift going up
   - Click ↓ button to call a lift going down
   - Ground floor only has ↑ button
   - Top floor only has ↓ button

3. **Watch the Magic**:
   - Lifts automatically dispatch to called floors
   - Doors open and close realistically
   - Multiple calls are queued and processed efficiently

## Project Structure

```
lift-simulator/
├── index.html          # Main HTML structure
├── styles.css          # All styling and animations
├── script.js           # Application logic and controllers
├── package.json        # Project metadata and scripts
├── .gitignore          # Git ignore rules
└── README.md           # This file
```

## Technical Details

### Architecture Pattern
- **MVC-like Pattern**: Separation of concerns between data, logic, and presentation
- **Event-Driven**: Asynchronous lift operations using Promises
- **State Management**: Centralized application state

### Key Components

#### AppState
- Stores number of floors and lifts
- Tracks lift states (position, movement, doors)
- Manages floor call queue

#### LiftController
- Finds optimal lift for each call
- Manages lift movement and door operations
- Handles queuing and scheduling

#### UI
- Renders building structure
- Animates lift movement
- Updates visual states and indicators

## Browser Support
- Chrome (recommended)
- Firefox
- Safari
- Edge
- Mobile browsers

## License
MIT

## Contributing
Feel free to submit issues and enhancement requests!