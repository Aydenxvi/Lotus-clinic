# Implementation instruction for Claude (English)

I am uploading **LOTUS_CLINIC_REDESIGN_READY.zip**, which contains my **actual existing clinic site with a redesign already implemented**. Do not provide a plan or generate a separate sample site.

**Your job is to USE THIS ARCHIVE AS THE SOURCE OF TRUTH and apply its actual changed files to my working project.** The files are plain HTML/CSS/JavaScript (not React). Please do the implementation, not a description.

1. Identify the root `lotus/` directory in the attached archive and the corresponding directory in my existing workspace. Do not create a second unrelated copy of the website.
2. Merge or replace the exact redesigned files:
   - `index.html` (rewritten homepage structure)
   - `css/redesign.css` (NEW — shared visual design system; must load **after** `css/styles.css`)
   - `js/ui-icons.js` (NEW — icons; must load **before** `js/app.js`)
   - `js/app.js` (new reusable navbar/footer markup, preserving existing application functions)
   - Updated links to CSS and icons JS across all HTML pages.
   - `department.html` has a harmless duplicate HTML id fixed.
3. Preserve `js/data.js` exactly unless I explicitly request data changes. Do not invent or replace the existing doctors, departments, phone numbers, address, prices, or contacts.
4. Preserve all existing clinic pages and their features, including doctors search/filter, department search, booking wizard, patient cabinet, doctor/staff cabinet, and contact forms. Do not rewrite them as dead mockups.
5. The **homepage design, colors, grid, cards, icons, spacing, responsive breakpoints, header, and footer must visibly match the screenshot files** supplied in the ZIP (`preview-desktop.png`, `preview-mobile.png`). If your result looks unchanged, the task has NOT been completed.
6. Make sure every HTML page includes `<link rel="stylesheet" href="css/redesign.css">` after the original stylesheet and `<script src="js/ui-icons.js"></script>` before `js/app.js`.
7. Run the site, verify homepage layout at 1440px and 390px, and verify all other pages are visually consistent. Verify that links, navigation, filtering, booking wizard, and account screens still work. Check JavaScript console for runtime errors and eliminate horizontal overflow.
8. Tell me **exactly which files you changed**, what you tested, and any remaining issues. Do not claim tests you did not run.

Important: The existing provided site uses browser-side demonstration storage for patient accounts/appointments. Do not claim there is a real secure production backend unless you actually verify one exists. Do not expose the existing demo credentials in user-facing content.

Your task is only complete when the actual project files have been updated with the provided redesign and its new visual appearance is verified in the running website.
