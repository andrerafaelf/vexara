# Neon Dominion

A free-to-play browser-based sci-fi strategy MMO where commanders build nodes, gather resources, and compete for galactic dominance.

## 🎮 Features

- **Node Management**: Build and upgrade 8 different structures
- **Resource System**: Biomass, Alloy, and Ore production
- **Military System**: Train 5 troop types and launch attacks
- **Starfield Map**: Interactive 11x11 grid to explore and conquer
- **Combat System**: Real-time attack resolution with detailed reports
- **Dashboard**: Empire overview with resource tracking
- **Admin Tools**: Full game management interface

## 🚀 Quick Start

### Prerequisites

- Node.js 16+
- Docker (for MongoDB)

### Installation

1. **Clone the repository**

```bash
git clone <repository-url>
cd neon-dominion
```

2. **Start MongoDB with Docker**

```bash
docker-compose up -d
```

3. **Install dependencies**

```bash
# Install root dependencies
npm install

# Install server and client dependencies
cd server && npm install
cd ../client && npm install
```

4. **Start the application**

```bash
# From root directory
npm run dev
```

This will start:

- Backend server on http://localhost:3001
- Next.js frontend on http://localhost:3000

### Creating Test Nodes

To populate the map with test villages for testing combat:

```bash
cd server
node create-test-nodes.js
```

## 🏗️ Project Structure

```
neon-dominion/
├── client/          # Next.js frontend (TypeScript + React)
│   ├── src/
│   │   ├── app/            # Next.js App Router pages
│   │   ├── components/     # React components
│   │   ├── context/        # Authentication context
│   │   ├── services/       # API client
│   │   ├── styles/         # CSS files
│   │   └── types/          # TypeScript definitions
│   └── public/      # Static assets
├── server/          # Express backend
│   ├── models/      # MongoDB models (User, Node, Attack)
│   ├── routes/      # API endpoints
│   ├── middleware/  # Auth middleware
│   └── utils/       # Combat system utilities
└── docker-compose.yml
```

## 🎯 Game Mechanics

### Resources

- **Biomass** 🧬: Organic materials for construction
- **Alloy** ⚙️: Advanced materials for structures
- **Ore** 💎: Raw minerals for weapons

Each resource generates per hour based on building levels.

### Buildings

| Building         | Max Level | Purpose                        |
| ---------------- | --------- | ------------------------------ |
| Command Core     | 30        | Unlocks building upgrades      |
| Troop Fabricator | 25        | Enables troop training         |
| Life Support     | 30        | Increases population capacity  |
| Storage Vault    | 30        | Stores resources               |
| Biomass Farm     | 30        | Generates Biomass              |
| Alloy Forge      | 30        | Produces Alloy                 |
| Ore Extractor    | 30        | Mines Ore                      |
| Shield Grid      | 20        | Defensive bonus (2% per level) |

### Troop Types

| Unit               | Attack | Defense | Speed | Cost        |
| ------------------ | ------ | ------- | ----- | ----------- |
| Lancer Drone 🛡️    | 10     | 15      | 18s   | 50/30/10    |
| Assault Trooper ⚔️ | 25     | 50      | 22s   | 30/30/70    |
| Breaker Unit 🪓    | 40     | 10      | 18s   | 60/30/40    |
| Recon Drone 🏹     | 15     | 50      | 18s   | 100/30/60   |
| Siege Mech 🐎      | 150    | 200     | 10s   | 250/100/150 |

See [TROOPS.md](TROOPS.md) for detailed unit information.

### Combat System

- Attacks travel based on distance and troop speed
- Combat auto-resolves every 10 seconds
- Winners plunder up to 50% of defender resources
- Wall provides defensive bonus
- Detailed reports track all losses and gains

## 🛠️ Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript
- **Backend**: Node.js, Express.js
- **Database**: MongoDB 8.0 (Docker container)
- **Auth**: JWT tokens, bcrypt
- **ORM**: Mongoose

## 📜 API Endpoints

### Authentication

- `POST /api/auth/register` - Create new account
- `POST /api/auth/login` - Login to account

### Game

- `GET /api/node/:id` - Get node details
- `POST /api/building/upgrade` - Upgrade building
- `POST /api/troop/train` - Train troops
- `GET /api/map/nodes` - Get map data
- `POST /api/attack/send` - Send attack
- `GET /api/report/reports/:nodeId` - Get combat reports

### Admin

- `GET /api/admin/*` - Various admin endpoints

## 🎮 Gameplay Guide

1. **Register** an account at `/auth`
2. **Build** resource buildings to generate income
3. **Upgrade** Command Core to unlock higher building levels
4. **Train troops** at the Troop Fabricator
5. **Explore** the Starfield map to find targets
6. **Attack** nearby nodes to plunder resources
7. **Review** combat reports to track your conquests

## 📝 Development

### Backend Development

```bash
cd server
npm run dev  # Starts with nodemon for hot reload
```

### Frontend Development

```bash
cd client
npm run dev  # Next.js dev server with hot reload
```

### Environment Variables

Create `server/.env`:

```
MONGODB_URI=mongodb://localhost:27017/neon-dominion
JWT_SECRET=your-secret-key-here
PORT=3001
```

## 🐛 Troubleshooting

**MongoDB connection issues:**

- Ensure Docker is running: `docker ps`
- Restart MongoDB: `docker-compose restart`

**Port already in use:**

- Check what's using the port: `netstat -ano | findstr :3000`
- Kill the process or change the port in config

**Frontend not connecting to backend:**

- Verify backend is running on port 3001
- Check browser console for errors
- Ensure API calls use correct base URL

## 📄 License

MIT

## 🤝 Contributing

This is a personal project. Feel free to fork and modify for your own use.
