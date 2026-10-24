--[[ LuaPilot Importer - Roblox Studio plugin (MIT)
Imports the FBX models that LuaPilot exported from Blender. It talks to the LuaPilot app on this computer
(http://127.0.0.1:17615): the app lists the files waiting in its models folder, this plugin imports them with
Studio's own importer and reports back. Studio asks once for permission to use localhost - allow it. ]]
local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")
local BASES = { "http://127.0.0.1:17615", "http://localhost:17615" }
local base = 1

local BG, CARD, LINE = Color3.fromRGB(11, 12, 15), Color3.fromRGB(22, 24, 30), Color3.fromRGB(42, 46, 56)
local FG, DIM = Color3.fromRGB(235, 237, 242), Color3.fromRGB(140, 147, 162)
local GREEN, RED, AMBER, BLUE = Color3.fromRGB(52, 211, 153), Color3.fromRGB(248, 113, 113), Color3.fromRGB(251, 191, 36), Color3.fromRGB(96, 165, 250)

local toolbar = plugin:CreateToolbar("LuaPilot")
local button = toolbar:CreateButton("LuaPilot", "Open the LuaPilot model importer", "")
button.ClickableWhenViewportHidden = true

local widget = plugin:CreateDockWidgetPluginGui("LuaPilotImporter",
	DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Right, false, false, 300, 380, 260, 240))
widget.Title = "LuaPilot"

local function new(class, props, parent)
	local o = Instance.new(class)
	for k, v in pairs(props) do o[k] = v end
	o.Parent = parent
	return o
end
local function round(o, r) new("UICorner", { CornerRadius = UDim.new(0, r) }, o) end
local function pad(o, p) new("UIPadding", { PaddingLeft = UDim.new(0, p), PaddingRight = UDim.new(0, p), PaddingTop = UDim.new(0, p), PaddingBottom = UDim.new(0, p) }, o) end

local root = new("Frame", { Size = UDim2.fromScale(1, 1), BackgroundColor3 = BG, BorderSizePixel = 0 }, widget)
pad(root, 12)
new("UIListLayout", { Padding = UDim.new(0, 10), SortOrder = Enum.SortOrder.LayoutOrder }, root)

-- header: logo (dark disc with a white paper plane, drawn from frames) + name + status
local header = new("Frame", { Size = UDim2.new(1, 0, 0, 44), BackgroundTransparency = 1, LayoutOrder = 1 }, root)
local logo = new("Frame", { Size = UDim2.fromOffset(40, 40), BackgroundColor3 = Color3.fromRGB(18, 19, 24), BorderSizePixel = 0, ClipsDescendants = true }, header)
round(logo, 20)
new("UIStroke", { Color = LINE, Thickness = 1 }, logo)
local wing = new("Frame", { AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.52, 0.5), Size = UDim2.fromOffset(17, 17),
	Rotation = 45, BackgroundColor3 = Color3.new(1, 1, 1), BorderSizePixel = 0 }, logo)
round(wing, 2)
new("Frame", { AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.43, 0.57), Size = UDim2.fromOffset(15, 2), Rotation = 45,
	BackgroundColor3 = Color3.fromRGB(18, 19, 24), BorderSizePixel = 0 }, logo)
new("TextLabel", { Position = UDim2.fromOffset(50, 0), Size = UDim2.new(1, -50, 0, 22), BackgroundTransparency = 1, Text = "LuaPilot",
	TextColor3 = FG, Font = Enum.Font.GothamBold, TextSize = 17, TextXAlignment = Enum.TextXAlignment.Left }, header)
local statusLbl = new("TextLabel", { Position = UDim2.fromOffset(50, 22), Size = UDim2.new(1, -50, 0, 18), BackgroundTransparency = 1, Text = "Model importer",
	TextColor3 = DIM, Font = Enum.Font.Gotham, TextSize = 12, TextXAlignment = Enum.TextXAlignment.Left }, header)

-- list of model files
local listCard = new("ScrollingFrame", { Size = UDim2.new(1, 0, 1, -128), BackgroundColor3 = CARD, BorderSizePixel = 0, LayoutOrder = 2,
	ScrollBarThickness = 4, CanvasSize = UDim2.new(), AutomaticCanvasSize = Enum.AutomaticSize.Y }, root)
round(listCard, 8); pad(listCard, 8)
new("UIListLayout", { Padding = UDim.new(0, 6) }, listCard)
local emptyLbl = new("TextLabel", { Size = UDim2.new(1, 0, 0, 40), BackgroundTransparency = 1, TextWrapped = true, Text = "No models yet. They show up here when the AI exports them from Blender.",
	TextColor3 = DIM, Font = Enum.Font.Gotham, TextSize = 12 }, listCard)

local function makeButton(text, primary, order)
	local b = new("TextButton", { Size = UDim2.new(1, 0, 0, 32), BackgroundColor3 = primary and Color3.fromRGB(240, 242, 247) or CARD, BorderSizePixel = 0,
		Text = text, TextColor3 = primary and Color3.fromRGB(12, 12, 14) or FG, Font = Enum.Font.GothamBold, TextSize = 13, AutoButtonColor = true, LayoutOrder = order }, root)
	round(b, 8)
	if not primary then new("UIStroke", { Color = LINE, Thickness = 1 }, b) end
	return b
end
local importBtn = makeButton("Import new models", true, 3)
local autoBtn = makeButton("Auto-import: on", false, 4)
local noteLbl = new("TextLabel", { Size = UDim2.new(1, 0, 0, 30), BackgroundTransparency = 1, TextWrapped = true, Text = "", TextColor3 = DIM,
	Font = Enum.Font.Gotham, TextSize = 11, TextXAlignment = Enum.TextXAlignment.Left, TextYAlignment = Enum.TextYAlignment.Top, LayoutOrder = 5 }, root)

local lastError, connected, autoOn = "", false, true

-- Studio only lets plugins call localhost when the place has "Allow HTTP Requests" on (Game Settings > Security).
-- A plugin may switch it on itself; do it at start and again whenever a request is refused.
local function allowHttp()
	local ok = pcall(function() HttpService.HttpEnabled = true end)
	return ok and HttpService.HttpEnabled
end
allowHttp()

local function request(method, path, body)
	local failures = {}
	for n = 0, #BASES - 1 do
		local idx = ((base - 1 + n) % #BASES) + 1
		local ok, res = pcall(function()
			return HttpService:RequestAsync({ Url = BASES[idx] .. path, Method = method, Headers = { ["Content-Type"] = "application/json" },
				Body = body and HttpService:JSONEncode(body) or nil })
		end)
		if not ok then
			local e = tostring(res)
			table.insert(failures, BASES[idx] .. " " .. e)
			if string.find(e, "Http requests are not enabled", 1, true) or string.find(e, "403", 1, true) then allowHttp() end
		elseif not res.Success then
			table.insert(failures, BASES[idx] .. " " .. res.StatusCode .. " " .. tostring(res.StatusMessage))
		else
			base = idx
			lastError = ""
			local okj, data = pcall(HttpService.JSONDecode, HttpService, res.Body)
			return okj and data or {}
		end
	end
	lastError = table.concat(failures, " | ")
	warn("[LuaPilot] cannot reach the LuaPilot app: " .. lastError)
	return nil
end

local rows = {}
local function render(list, results)
	for _, r in pairs(rows) do r:Destroy() end
	rows = {}
	local files = list and list.files or {}
	emptyLbl.Visible = #files == 0
	for i, f in ipairs(files) do
		local res = results and results[f.name]
		local color, text = AMBER, "waiting"
		if f.imported then color, text = GREEN, "imported"
		elseif res and not res.ok then color, text = RED, "failed" end
		local row = new("Frame", { Size = UDim2.new(1, 0, 0, 34), BackgroundColor3 = BG, BorderSizePixel = 0, LayoutOrder = i }, listCard)
		round(row, 6)
		local dot = new("Frame", { Position = UDim2.fromOffset(10, 13), Size = UDim2.fromOffset(8, 8), BackgroundColor3 = color, BorderSizePixel = 0 }, row)
		round(dot, 4)
		new("TextLabel", { Position = UDim2.fromOffset(26, 0), Size = UDim2.new(1, -96, 1, 0), BackgroundTransparency = 1, Text = f.name, TextColor3 = FG,
			Font = Enum.Font.Gotham, TextSize = 12, TextXAlignment = Enum.TextXAlignment.Left, TextTruncate = Enum.TextTruncate.AtEnd }, row)
		new("TextLabel", { AnchorPoint = Vector2.new(1, 0), Position = UDim2.new(1, -8, 0, 0), Size = UDim2.fromOffset(62, 34), BackgroundTransparency = 1,
			Text = text, TextColor3 = color, Font = Enum.Font.GothamMedium, TextSize = 11, TextXAlignment = Enum.TextXAlignment.Right }, row)
		table.insert(rows, row)
	end
end

local busy = false
local function setStatus(text, color) statusLbl.Text = text statusLbl.TextColor3 = color or DIM end

local function refresh()
	local hello = request("POST", "/hello", {})
	connected = hello ~= nil
	if not connected then
		setStatus("LuaPilot app not reachable", RED)
		noteLbl.Text = "Start the LuaPilot app. If it is running, turn on Game Settings > Security > Allow HTTP Requests. " .. (lastError ~= "" and ("(" .. lastError .. ")") or "")
		return
	end
	setStatus("Connected to the LuaPilot app", GREEN)
	local list = request("GET", "/list")
	if list then render(list, list.results) end
end

local function run()
	if busy then return end
	busy = true
	local pending = request("GET", "/pending")
	if pending and pending.files and #pending.files > 0 then
		setStatus("Importing " .. #pending.files .. " model(s)...", BLUE)
		for _, f in ipairs(pending.files) do
			local ok, info = importAsset(f)
			request("POST", "/done", { name = f.name, ok = ok, info = info })
			noteLbl.Text = (ok and "Imported " or "Failed: ") .. f.name .. (ok and "" or (" - " .. info))
		end
	end
	busy = false
	refresh()
end

importBtn.MouseButton1Click:Connect(function()
	if request("POST", "/queue", {}) then run() else refresh() end
end)
autoBtn.MouseButton1Click:Connect(function()
	autoOn = not autoOn
	autoBtn.Text = "Auto-import: " .. (autoOn and "on" or "off")
end)
button.Click:Connect(function() widget.Enabled = not widget.Enabled end)
widget:GetPropertyChangedSignal("Enabled"):Connect(function() button:SetActive(widget.Enabled) end)

task.spawn(function()
	while true do
		if autoOn then run() else refresh() end
		task.wait(connected and 2 or 6)
	end
end)
