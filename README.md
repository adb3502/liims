# BHARAT Study LIMS

Laboratory Information Management System for the BHARAT Study (Biomarkers of Healthy Aging, Resilience, Adversity, and Transitions).

## Overview

Multi-omics aging research platform handling 5,000 participants across five age groups in India.

## Setup

1. Clone the repository
2. Copy `.env.example` to `.env` and configure
3. Install dependencies: `pip install -r requirements.txt`
4. Run migrations: `python manage.py migrate`
5. Start development server: `python manage.py runserver`

## Project Structure

```
lims/
├── src/          # Application source code
├── tests/        # Unit and integration tests
├── docs/         # Architecture and API documentation
├── scripts/      # Deployment and setup scripts
└── .env.example  # Environment configuration template
```

## Features

- Sample tracking and barcode management
- Participant enrollment and consent tracking
- Multi-site data collection
- Offline-first architecture
- Quality control workflows

## Tech Stack

- Backend: Python/Django or FastAPI
- Database: PostgreSQL
- Frontend: React/Vue (if applicable)

## Contributing

Write tests. Document decisions. Commit messages matter.

## License

[To be determined]
