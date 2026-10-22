# Student Productivity & Smart Study Planner

```
study-planner/
├── backend/app.py        # Python (stdlib + SQLite): serves the site + REST API
├── frontend/
│   ├── index.html
│   ├── sw.js             # service worker (offline shell)
│   ├── css/style.css
│   └── js/app.js         # all app behaviour
└── README.md
```

## Run
```
python backend/app.py      # needs Python 3.8+, no pip installs
```
Open http://localhost:5050

## API
`GET /api/<table>` and `PUT /api/<table>` (replaces the list) for:
users, tasks, assignments, attendance, goals, notes, courses.

## How offline works
Every change is saved to localStorage instantly and pushed to Python in the background.
If the server is unreachable the change is flagged and synced when it's back.

Shortcuts: `1-9` switch views · `/` search · `n` new task · `d` dark mode
