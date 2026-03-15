# Postman Import

Import these two files into Postman:

- [SkinnerBox.postman_collection.json](/Users/egweinberg/Documents/skinnerbox-fullstack-student/postman/SkinnerBox.postman_collection.json)
- [SkinnerBox.local.postman_environment.json](/Users/egweinberg/Documents/skinnerbox-fullstack-student/postman/SkinnerBox.local.postman_environment.json)

Use this request order for a full validation run:

1. `Health Check`
2. `Login Default Admin`
3. `Register Operator`
4. `List Users And Cache Operator Id`
5. `Approve Operator Access`
6. `Login Approved Operator`
7. `Save Trial Configuration`
8. `Start Trial`
9. `Simulate Lever Press` three times
10. `Get Counts`
11. `Get Test Status`
12. `Get Results`

Default environment values assume:

- backend URL: `http://localhost:5000`
- validation admin email: `admin@example.com`
- validation admin password: `AdminPass123`

If your backend is not running on port `5000`, open the `SkinnerBox Local` environment and change `baseUrl` to match the real backend URL, for example:

- `http://localhost:5001`
- `http://192.168.1.50:5000`
- `http://192.168.1.50:5001`

You can change the operator email/password and the trial parameters directly in the Postman environment as well.

The current Postman trial payload also includes:

- `endChimeEnabled`
- `endChimePattern`

So you can validate the optional passive-buzzer end chime from Postman too.

OLED behavior does not have a separate API endpoint. It is driven by the same trial lifecycle calls:

- `Save Trial Configuration` should put the OLED into its waiting/configured screen on the Pi
- `Start Trial`, `Simulate Lever Press`, `Get Counts`, and `Get Test Status` drive the live running display
- `Get Results` now verifies the saved end-chime fields in the backend response
