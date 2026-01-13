# Design Documentation

The design documentation has been reorganized into focused documents in the `docs/` folder.

## Quick Links

- **[Documentation Overview](docs/INDEX.md)** - Project overview, inspiration, and vision
- **[Portability Rules](docs/portability-rules.md)** - All portability enforcement rules and constraints
- **[Architecture](docs/architecture.md)** - High-level architecture, design principles, and platform strategy
- **[Rendering](docs/rendering.md)** - Rendering system, lighting, and day/night cycle
- **[Camera](docs/camera.md)** - Camera system and mathematical formulas
- **[Systems](docs/systems.md)** - World, party, input, collision, and geometry systems
- **[Data Formats](docs/data-formats.md)** - Data format specifications
- **[Project Structure](docs/project-structure.md)** - Code organization and project structure
- **[Porting Strategy](docs/porting-strategy.md)** - Porting approach, FFI constraints, and learning path

## Why the Split?

The original DESIGN.md file had grown to over 1,600 lines, making it difficult to navigate and maintain. The documentation has been split into focused documents that are easier to:

- Navigate and find specific information
- Maintain and update
- Reference in discussions
- Share with team members working on specific areas

Each document focuses on a specific aspect of the design, while the [INDEX.md](docs/INDEX.md) provides an overview and navigation to all documentation.
