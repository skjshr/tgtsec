# Kazekiri Target Web Design QA

Date: 2026-07-31
Scope: `fixtures/rootfs/var/www/kazekiri` multi-page public site and staff diagnostics
Preview: local WSL PHP development server

## Evidence

- [Public home, 1280×720](../../../docs/qa/target-web/home-1280x720.png)
- [Public home, 375×844](../../../docs/qa/target-web/home-375x844.png)
- [Inventory, 1280×720](../../../docs/qa/target-web/inventory-1280x720.png)
- [Vehicle detail, 1280×720](../../../docs/qa/target-web/vehicle-1280x720.png)
- [Staff diagnostics, 1280×720](../../../docs/qa/target-web/diagnostics-1280x720.png)
- [Staff diagnostics result, 1280×720](../../../docs/qa/target-web/diagnostics-result-1280x720.png)
- [Staff diagnostics, 375×844](../../../docs/qa/target-web/diagnostics-375x844.png)

## Review

### Information architecture: passed

The public site now separates inventory, vehicle details, service, shop, news,
articles, FAQ, and visit consultation into real routes. Shared navigation and
breadcrumbs keep those routes connected. The staff page remains a distinct
service-desk utility.

### Hierarchy and visual grammar: passed

Warm paper, ink, rust red, blue-grey, square rules, and local system typography
create one regional workshop identity. Generated workshop, stock, store, service,
and area photography is presented without training labels or decorative overlays.
The quiet exercise disclosure appears only once in the footer.

### Commerce and service credibility: passed

Six allowlisted fictional vehicles expose vehicle price, estimated total, year,
mileage, condition, maintenance history, status, and a consultation path. Service
and shop pages connect inspection, delivery, after-service, hours, and access
details without fake certification claims or external dependencies.

### Interaction: passed

Inventory filters return matching, empty, and rejected states. Unknown vehicles
and articles return designed 404 pages. Contact validation returns `422`; a valid
submission issues an in-memory receipt and does not save or send the visitor's
input. Staff diagnostics returns a real local ping result to the anchored polite
live region.

## Browser and HTTP checks

- Home at 1280×720 and 375×844: headline fits, image loads, no body overflow
- Inventory and vehicle detail at 1280×720: filters, pricing, imagery, and CTA fit
- Vehicle detail at 375px: no body overflow or orphaned title character
- Shop at desktop and 390px: headline fits and full-bleed image has no body overflow
- Staff diagnostics at 1280×720 and 375×844: form fits; POST result is visible
- HTTP route, error, form, diagnostic, and asset matrix: `35/35` passed
- All 16 local WebP files returned `200 image/webp` and exceeded 10 KB
- Every checked rendered route contained exactly one quiet exercise disclosure
- PHP lint: all 12 PHP files passed
- Target Web fixture subtest: passed

## Exercise contract checks

- Intentional command concatenation remains unchanged
- POST field name remains `target`
- Raw input is not sent to telemetry
- Entry and foothold event tuples remain unchanged
- No external script, font, analytics, map, or image request is present

## Remaining physical gate

This browser review uses the real PHP templates and POST flow, but not the
provisioned Debian notebook. The physical target still requires a rebuilt bundle,
installation, Apache verification at `10.13.37.10`, and an end-to-end event check.

final result: passed
