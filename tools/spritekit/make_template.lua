-- make_template.lua — emit a ready-to-draw FFTA unit rig.
--
--   aseprite -b --script-param out=<path.aseprite> \
--     --script-param w=16 --script-param h=40 \
--     --script-param pal=<comma-separated #rrggbb, 16 entries> \
--     --script-param ref=<optional sheet.png to onion-skin> \
--     --script tools/spritekit/make_template.lua
--
-- The rig encodes everything the conversion work established, so a new unit drawn into
-- it needs no post-hoc fixing: the verified 16-colour battle-map palette (flat_m2[23],
-- slot 0 = never-drawn backdrop, slot 1 = #000000 ground shadow), the 16-frame timeline,
-- and the eight tags with source-faithful durations.
--
-- Layers, bottom to top:
--   ref     the donor sheet's matching frame, dimmed — draw over it, then delete
--   guide   OAM band seams at y8 / y24 (where FFTA splits its objects) + the anchor row
--   pixel   empty; your art goes here (matches what plan.py/assemble_plan.lua expect)

local out = app.params["out"]
local W   = tonumber(app.params["w"]) or 16
local H   = tonumber(app.params["h"]) or 40
if not out or out == "" then error("make_template.lua: missing --script-param out=<path>") end

local function parseColor(hex)
  if not hex or hex == "" then return Color{ r=0, g=0, b=0, a=0 } end
  hex = hex:gsub("#", "")
  return Color{ r=tonumber(hex:sub(1,2),16), g=tonumber(hex:sub(3,4),16),
                b=tonumber(hex:sub(5,6),16), a=255 }
end

local sprite = Sprite(W, H, ColorMode.RGB)
sprite.filename = out

-- palette ------------------------------------------------------------------
local hexes = {}
for s in (app.params["pal"] or ""):gmatch("[^,]+") do hexes[#hexes+1] = s end
if #hexes > 0 then
  local pal = Palette(#hexes)
  for i, h in ipairs(hexes) do pal:setColor(i-1, parseColor(h)) end
  sprite:setPalette(pal)
end

-- 16 frames: idle 1+1, walk 4+4, attack 1+1, flinch 2+2 -----------------------
local TAGS = {
  { name="idle-se",   n=1, ms={333} },
  { name="idle-ne",   n=1, ms={333} },
  { name="walk-se",   n=4, ms={91,91,91,91} },
  { name="walk-ne",   n=4, ms={91,91,91,91} },
  { name="attack-se", n=1, ms={400} },
  { name="attack-ne", n=1, ms={400} },
  { name="flinch-se", n=2, ms={728,91} },
  { name="flinch-ne", n=2, ms={728,91} },
}
local total = 0
for _, t in ipairs(TAGS) do total = total + t.n end
while #sprite.frames < total do sprite:newEmptyFrame(#sprite.frames + 1) end

local layer = sprite.layers[1]
layer.name = "pixel"
local guide = sprite:newLayer(); guide.name = "guide"; guide.opacity = 90
local ref   = sprite:newLayer(); ref.name = "ref";     ref.opacity = 96

-- ref layer: the donor sheet's frames, so you can trace silhouette and footing.
-- Sheet frame order is the ROM's 34-frame layout; these are the ones each tag maps to.
local SRC = {0, 4, 0,1,2,3, 4,5,6,7, 8, 12, 16,24, 25,33}
local refImg = nil
if app.params["ref"] and app.params["ref"] ~= "" then
  refImg = Image{ fromFile = app.params["ref"] }
end

local f = 1
for _, t in ipairs(TAGS) do
  local from = f
  for i = 1, t.n do
    sprite.frames[f].duration = t.ms[i] / 1000.0
    if refImg then
      local cel = Image(W, H, ColorMode.RGB)
      cel:drawImage(refImg, Point(-SRC[f] * W, 0))
      sprite:newCel(ref, f, cel, Point(0, 0))
    end
    -- guide: OAM band seams (y8, y24) and the anchor baseline
    local g = Image(W, H, ColorMode.RGB)
    for x = 0, W-1, 2 do
      g:drawPixel(x, 8,  Color{ r=255, g=0,   b=255, a=70 })
      g:drawPixel(x, 24, Color{ r=255, g=0,   b=255, a=70 })
      g:drawPixel(x, H-1, Color{ r=0,  g=255, b=255, a=70 })
    end
    sprite:newCel(guide, f, g, Point(0, 0))
    f = f + 1
  end
  local tag = sprite:newTag(from, f - 1)
  tag.name = t.name
end

sprite:saveAs(out)
sprite:close()
print(string.format("template %dx%d  %d frames  %d tags  -> %s", W, H, total, #TAGS, out))
