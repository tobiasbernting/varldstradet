class_name Api
extends Node
## The server's JSON routes for a native client: POST /api/join, GET /api/gate, GET /api/players, POST /api/players. The device token
## goes as a bearer header; there are no cookies and no Origin header.


## One request, awaited. The answer is {ok, status, body} (body is the parsed JSON, {} when there is none), or
## {ok: false, status: 0, error: "unreachable"} when the server did not answer at all.
func request_json(method: HTTPClient.Method, path: String, body: Variant = null, with_token: bool = true) -> Dictionary:
	var req := HTTPRequest.new()
	req.timeout = 15.0
	add_child(req)
	var headers := PackedStringArray(["Accept: application/json"])
	if with_token and Settings.token != "":
		headers.append("Authorization: Bearer " + Settings.token)
	var data := ""
	if body != null:
		headers.append("Content-Type: application/json")
		data = JSON.stringify(body)
	var err := req.request(Settings.http_url(path), headers, method, data)
	if err != OK:
		req.queue_free()
		return {"ok": false, "status": 0, "error": "unreachable", "body": {}}
	var answer: Array = await req.request_completed
	req.queue_free()
	var result: int = answer[0]
	var status: int = answer[1]
	var bytes: PackedByteArray = answer[3]
	if result != HTTPRequest.RESULT_SUCCESS:
		return {"ok": false, "status": 0, "error": "unreachable", "body": {}}
	var parsed: Variant = JSON.parse_string(bytes.get_string_from_utf8())
	var ok := status >= 200 and status < 300
	return {"ok": ok, "status": status, "body": parsed if (parsed is Dictionary or parsed is Array) else {}}


## The join itself sends no token: the answer brings the new one.
func join(code: String, device_name: String) -> Dictionary:
	return await request_json(HTTPClient.METHOD_POST, "/api/join", {"code": code, "name": device_name}, false)


func gate() -> Dictionary:
	return await request_json(HTTPClient.METHOD_GET, "/api/gate")


func players() -> Dictionary:
	return await request_json(HTTPClient.METHOD_GET, "/api/players")


## A new character for this device (POST /api/players, the same body the browser's creator sent). `appearance` is
## {skin, hair, hairStyle} (skin and hair as #rrggbb); `shirt` one of the starter shirts. The answer's body is the new
## player ({id, name, appearance, outfit}) on 201; on failure its `error` is "name" (400), "create" or "access" (403)
## or "full" (409).
func create_player(player_name: String, appearance: Dictionary, shirt: String) -> Dictionary:
	return await request_json(HTTPClient.METHOD_POST, "/api/players", {"name": player_name, "appearance": appearance, "shirt": shirt})
