# Minimum Viable Health Dataspace v2

This repository contains the ongoing planning documents, architecture decisions, and schema definitions for the Minimum Viable Health Dataspace v2.

## Structure

- `planning-health-dataspace-v2.md`: Core project planning, objectives, and proposed steps.
- `health-dataspace-graph-schema.md`: Schema definitions and initial data graph structures.
- `/`: Future location for planned implementations and code components.

## Development and Contributing

Currently, the minimal viable product is transitioning from documentation into standard project structures. We use `pre-commit` hooks alongside linters (like Prettier) to ensure that both our documentation and future code maintain consistent formatting.

### Prerequisites

You need to have Python installed for `pre-commit` or be able to install it via `brew`.

```bash
# Install pre-commit (macOS)
brew install pre-commit
# Or via pip
pip install pre-commit
```

### Setup

Once cloned, initialize the pre-commit hooks in this repository:

```bash
pre-commit install
```

This will automatically format Markdown files, fix trailing whitespaces, and prepare the project for code linters once code directories are added.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
