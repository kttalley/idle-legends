-- assemble_plan.lua — materialize one .aseprite from a plan.json.
--
-- Headless: aseprite -b \
--   --script-param plan=<path/to/plan.json> \
--   --script-param out=<path/to/output.aseprite> \
--   --script tools/aseprite_bridge/assemble_plan.lua
--
-- plan.json is produced by plan.py. This script mirrors what drive.py emits as a
-- pixel-mcp recipe (RGB mode so per-pixel alpha survives, 16-color palette as a
-- reference, one 'pixel' layer, frames imported in tag order with fps-derived
-- durations, one tag per anim+facing) — but in a single deterministic Aseprite
-- batch run instead of ~125 sequential MCP calls.

-- `json` is a preloaded global on this Aseprite dev build (see build.lua).
local function loadJson(path)
  local f = io.open(path, "r")
  if not f then error("assemble_plan.lua: cannot open plan " .. tostring(path)) end
  local s = f:read("a")
  f:close()
  return json.decode(s)
end

local planPath = app.params["plan"]
local outPath  = app.params["out"]
if not planPath or planPath == "" then error("assemble_plan.lua: missing --script-param plan=<path>") end
if not outPath  or outPath  == "" then error("assemble_plan.lua: missing --script-param out=<path>")  end

local plan = loadJson(planPath)
local stageDir = app.fs.filePath(planPath)  -- .../_aseprite_stage/<rigId>

-- "#rrggbb" -> Color. "transparent" / "" -> fully transparent (slot 0).
local function parseColor(hex)
  if not hex or hex == "" or hex == "transparent" then
    return Color{ r = 0, g = 0, b = 0, a = 0 }
  end
  hex = hex:gsub("#", "")
  return Color{
    r = tonumber(hex:sub(1, 2), 16),
    g = tonumber(hex:sub(3, 4), 16),
    b = tonumber(hex:sub(5, 6), 16),
    a = 255,
  }
end

local function frameMs(fps)
  return math.max(1, math.floor(1000 / fps + 0.5))
end

local fw, fh = plan.frameW, plan.frameH
local sprite = Sprite(fw, fh, ColorMode.RGB)

-- Palette: 16 reference slots (slot 0 transparent). RGB mode uses per-pixel
-- alpha for actual transparency; the palette is a reference for the artist.
local pal = Palette(#plan.palette)
for i, hex in ipairs(plan.palette) do pal:setColor(i - 1, parseColor(hex)) end
sprite:setPalette(pal)

-- Two layers, bottom to top: 'shadow' carries the ground ellipse that strip_shadow.py
-- split off into <frame>.shadow.png, 'pixel' carries the unit itself. Composited they
-- are byte-identical to the unsplit frame; separate, the cast shadow can be toggled or
-- restyled without touching the art. Frames with no painted shadow simply get no cel.
local shadowLayer = sprite.layers[1]
shadowLayer.name = "shadow"
local layer = sprite:newLayer()
layer.name = "pixel"

-- Walk tags in order; each tag's framePaths give the cel order. Durations come from
-- the tag's per-frame durationsMs when present (plan.py collapses runs of identical
-- frames into one frame that holds for the whole run), falling back to the tag fps.
local frameNo = 1
local tagRanges = {}
for _, tag in ipairs(plan.tags) do
  local fromF = frameNo
  local ms = frameMs(tag.fps)
  for i, rel in ipairs(tag.framePaths) do
    if frameNo > 1 then sprite:newEmptyFrame(#sprite.frames + 1) end
    local fr = sprite.frames[frameNo]
    fr.duration = ((tag.durationsMs and tag.durationsMs[i]) or ms) / 1000.0
    local img = Image{ fromFile = app.fs.joinPath(stageDir, rel) }
    if img == nil then
      error(("assemble_plan.lua: failed to load frame %d (%s)"):format(frameNo, rel))
    end
    sprite:newCel(layer, frameNo, img, Point(0, 0))

    local shadowRel = rel:gsub("%.png$", ".shadow.png")
    local shadowFile = app.fs.joinPath(stageDir, shadowRel)
    if app.fs.isFile(shadowFile) then
      local simg = Image{ fromFile = shadowFile }
      if simg ~= nil then sprite:newCel(shadowLayer, frameNo, simg, Point(0, 0)) end
    end
    frameNo = frameNo + 1
  end
  tagRanges[#tagRanges + 1] = { name = tag.name, from = fromF, to = frameNo - 1 }
end

for _, tr in ipairs(tagRanges) do
  local t = sprite:newTag(tr.from, tr.to)
  t.name = tr.name
end

local nFrames, nLayers = #sprite.frames, #sprite.layers
sprite:saveAs(outPath)
sprite:close()
print(("%-28s %dx%-3d %2d frames  %2d layers  %2d tags  -> %s")
  :format(plan.rigId, fw, fh, nFrames, nLayers, #tagRanges, outPath))