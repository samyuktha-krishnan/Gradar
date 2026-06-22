# Gradar

Chrome extension that puts course info, sections, seats, professor ratings, schedule
conflicts, and a GPA estimate onto UW's MyPlan, so registration stops meaning fifteen
open tabs.

Vanilla JS, Manifest V3, no dependencies or build step.

## Features

- Course details, sections, SLNs, gen-ed credit, and live seat counts, inline
- Add a course to your MyPlan in one click
- Flags time conflicts against your real schedule, and courses already on your plan
- RateMyProfessors rating per instructor
- Estimates the grade you'll likely get from your transcript + the course's grade history
- Shows your actual grade instead if you've already taken the course

## Install

1. Go to `chrome://extensions`, turn on Developer mode
2. Load unpacked, pick the `gradar` folder
3. Open any course on myplan.uw.edu

Reload the extension card and refresh MyPlan after edits. To try it without logging in,
open `test.html`. It works quarter to quarter with no changes since it reads the active
term off the page and pulls your transcript live.

## How it works

MyPlan is a single-page app with no public API, so the integrations were built by watching
its own network calls and rebuilding the requests. Same for DawgPath (grade distributions)
and RateMyProfessors.

The annoying part was the CSRF token MyPlan needs for writes, which only exists in page
memory where a content script can't reach it. `inject.js` runs in the page's MAIN world and
patches `fetch`/`XHR` to grab the token off MyPlan's own requests, then hands it to the rest
of the extension. Plan and transcript data live on a separate host that breaks the add flow
if you add it to permissions, so those requests get relayed through the page over
`postMessage` instead.

Endpoints used:

| What | Where |
|------|-------|
| Course info, sections, seats | `course-app-api.planning.sis.uw.edu` |
| Plan + transcript | `plan-app-api.planning.sis.uw.edu` |
| Grade distributions | `dawgpath.uw.edu/api/v1` |
| Professor ratings | `ratemyprofessors.com/graphql` |

## The GPA estimate

It can't use other students' transcripts (FERPA), so it finds where you land in each
course's grade curve and maps that position onto the target course's curve. From there it
leans on courses similar to the target (department, level, and description overlap), the
course's actual difficulty from its grade distribution, your course load that quarter, the
professor's RMP, and a cap that keeps the estimate from drifting above your real average in
related classes.

It's a heuristic, not trained ML — a decent ballpark, and the range matters more than the
exact number.

## Files

`inject.js` page-world CSRF capture + plan relay · `data.js` API fetch, mappers, conflict
logic, transcript reader · `predict.js` the model · `panel.js` UI · `content.js` mounts the
panel · `background.js` cross-origin fetches · `styles.css` · `test.html` no-login preview ·
`gradar-recon.js` dev helper for capturing requests.

## Notes

Not affiliated with UW; it uses UW's internal endpoints plus public RMP/DawgPath data for
personal use. Currently wired for one user (with a frozen transcript as a fallback), though
the live path is generic to any UW student. DawgPath grades are historical and aggregate,
and UW hides small-sample data, so some courses have thin curves.

Todo: validate the model against my completed courses; swap the RMP proxy for real
per-instructor grade data.
