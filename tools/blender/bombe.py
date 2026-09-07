# A British bombe (Turing/Welchman, BTM Letchworth, 1940) for entry 001,
# chapter 008 — the machine that beat the machine.
#
# Parametric bpy, no .blend source. Scene units match the Enigma scene:
# 1 unit ≈ 11 cm (the Enigma case is 3.0 units ≈ 34 cm wide), so the bombe's
# ~7 ft × 6½ ft × 2 ft cabinet is ~19.4 × 18 × 5.5 units. Modelled Z-up with the
# drum face toward −Y; the glTF exporter turns that into Y-up with the face
# toward +Z. Origin = centre of the base footprint, on the floor.
#
# Front face: three banks, each 3 rows × 12 columns of drums = 108 drums
# (36 Enigma equivalents). Drums are colour-coded by rotor type, as the real
# ones were. Top-left carries the small indicator-drum unit.
#
#   node ~/bin/blender-run.mjs tools/blender/bombe.py \
#       --expect public/models/bombe.glb -- --out public/models/bombe.glb [--preview x.png]
import argparse, math, sys
import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True)
ap.add_argument("--preview")
args = ap.parse_args(argv)

# ── scene hygiene ──────────────────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
if sc.world is None:
    sc.world = bpy.data.worlds.new("World")
sc.world.use_nodes = True

W, D, H = 19.4, 5.5, 18.0        # cabinet width, depth, total height
PLINTH = 1.0
FACE_Y = -D / 2                  # front plane

def mat(name, rgb, metallic=0.0, roughness=0.5, emission=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 1.5
    return m

def srgb(hexstr):
    h = hexstr.lstrip("#")
    return tuple(((int(h[i:i + 2], 16) / 255.0) ** 2.2) for i in (0, 2, 4))

M_CAB   = mat("cabinet",  srgb("#2a2a2e"), 0.45, 0.55)
M_PLIN  = mat("plinth",   srgb("#141416"), 0.30, 0.70)
M_PLATE = mat("plate",    srgb("#3b2d22"), 0.65, 0.42)
M_BRASS = mat("brass",    srgb("#8a6b32"), 0.90, 0.35)
M_STEEL = mat("steel",    srgb("#9aa0a8"), 0.90, 0.30)
DRUM_COLOURS = {                 # rotor type → drum paint (approximate period colours)
    "I":   srgb("#b03a2e"),      # red
    "II":  srgb("#6b2a3a"),      # maroon
    "III": srgb("#2f6b3a"),      # green
    "IV":  srgb("#c9a227"),      # yellow
    "V":   srgb("#6b4a2a"),      # brown
}
M_DRUM = {k: mat(f"drum_{k}", v, 0.15, 0.55) for k, v in DRUM_COLOURS.items()}
M_LABEL = mat("label", srgb("#e9dfc4"), 0.0, 0.9)

def box(name, size, loc, material, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    if bevel > 0:
        b = o.modifiers.new("bevel", "BEVEL")
        b.width = bevel
        b.segments = 2
    o.data.materials.append(material)
    return o

def cyl(name, r, depth, loc, material, verts=28, rot=(math.pi / 2, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(material)
    return o

def apply_all(o):
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.select_set(False)

def join(objs, name):
    for o in bpy.data.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.select_set(False)
    return o

parts = []

# ── cabinet ────────────────────────────────────────────────────────────────
plinth = box("plinth", (W, D, PLINTH), (0, 0, PLINTH / 2), M_PLIN)
apply_all(plinth); parts.append(plinth)
cab = box("cabinet", (W, D, H - PLINTH), (0, 0, PLINTH + (H - PLINTH) / 2), M_CAB, bevel=0.12)
apply_all(cab); parts.append(cab)
# top lip and side rails
lip = box("lip", (W + 0.3, D + 0.3, 0.35), (0, 0, H + 0.1), M_PLIN, bevel=0.06)
apply_all(lip); parts.append(lip)

# ── drum face plate (proud of the cabinet front) ───────────────────────────
PW, PH = W - 1.0, H - PLINTH - 1.6
plate = box("plate", (PW, 0.18, PH), (0, FACE_Y - 0.09, PLINTH + 0.8 + PH / 2), M_PLATE, bevel=0.05)
apply_all(plate); parts.append(plate)
FACE = FACE_Y - 0.18   # front of the plate

# ── drums: 3 banks × 3 rows × 12 columns ───────────────────────────────────
COLS = 12
COL_X = [(i - (COLS - 1) / 2) * 1.5 for i in range(COLS)]
ROW_Z = []
z = PLINTH + 0.8 + PH - 1.35
for bank in range(3):
    for row in range(3):
        ROW_Z.append(z)
        z -= 1.45
    z -= 0.55
# rotor type per row: each Enigma-equivalent column stack is (top, middle, bottom)
# and different banks ran different wheel orders — vary by bank + row.
ROW_TYPES = ["I", "II", "III", "IV", "V", "I", "II", "III", "V"]

drums = {k: [] for k in M_DRUM}
nuts, rings = [], []
for ri, zc in enumerate(ROW_Z):
    t = ROW_TYPES[ri]
    for x in COL_X:
        d = cyl("drum", 0.58, 0.62, (x, FACE - 0.31, zc), M_DRUM[t])
        drums[t].append(d)
        ring = cyl("ring", 0.62, 0.10, (x, FACE - 0.05, zc), M_BRASS, verts=28)
        rings.append(ring)
        nut = cyl("nut", 0.13, 0.18, (x, FACE - 0.62 - 0.09, zc), M_STEEL, verts=12)
        nuts.append(nut)
# letter-ring hint: a thin pale band near the front of each drum
bands = []
for ri, zc in enumerate(ROW_Z):
    for x in COL_X:
        b = cyl("band", 0.585, 0.12, (x, FACE - 0.50, zc), M_LABEL, verts=28)
        bands.append(b)

for k, lst in drums.items():
    if lst:
        o = join(lst, f"drums_{k}")
        apply_all(o); parts.append(o)
o = join(rings, "rings"); apply_all(o); parts.append(o)
o = join(nuts, "nuts"); apply_all(o); parts.append(o)
o = join(bands, "bands"); apply_all(o); parts.append(o)

# ── indicator unit, top-left, above the plate ──────────────────────────────
ind = box("indicator", (4.2, 0.9, 1.1), (-W / 2 + 3.0, FACE_Y - 0.45, H - 0.75), M_PLATE, bevel=0.04)
apply_all(ind); parts.append(ind)
ind_drums = []
for i in range(3):
    ind_drums.append(cyl("ind", 0.36, 0.5, (-W / 2 + 1.9 + i * 1.1, FACE_Y - 0.9 - 0.25, H - 0.75), M_DRUM["III" if i else "I"], verts=20))
o = join(ind_drums, "indicator_drums"); apply_all(o); parts.append(o)

# ── maker's plate + a switch row along the bottom rail ─────────────────────
plate2 = box("makers_plate", (2.6, 0.06, 0.7), (W / 2 - 2.2, FACE_Y - 0.03, PLINTH + 0.4), M_BRASS)
apply_all(plate2); parts.append(plate2)
switches = []
for i in range(8):
    switches.append(cyl("sw", 0.12, 0.3, (-W / 2 + 1.6 + i * 0.6, FACE_Y - 0.15, PLINTH + 0.4), M_STEEL, verts=10))
o = join(switches, "switches"); apply_all(o); parts.append(o)

# ── export ─────────────────────────────────────────────────────────────────
for o in bpy.data.objects:
    o.select_set(o in parts)
bpy.ops.export_scene.gltf(
    filepath=args.out,
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_cameras=False,
    export_lights=False,
    export_normals=True,
    export_texcoords=False,
    export_materials="EXPORT",
)
tris = sum(len(p.data.polygons) for p in parts)
print(f"[bombe] parts={len(parts)} faces={tris} → {args.out}")

# ── optional preview render (Cycles CPU, transparent film) ─────────────────
if args.preview:
    cam_data = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cam_data)
    sc.collection.objects.link(cam)
    cam.location = (-14, -26, 12)
    cam.rotation_euler = (math.radians(70), 0, math.radians(-28))
    cam_data.lens = 35
    sc.camera = cam
    light_data = bpy.data.lights.new("key", "AREA")
    light_data.energy = 12000
    light_data.size = 12
    light = bpy.data.objects.new("key", light_data)
    sc.collection.objects.link(light)
    light.location = (-8, -14, 22)
    light.rotation_euler = (math.radians(35), 0, math.radians(-25))
    fill_data = bpy.data.lights.new("fill", "AREA")
    fill_data.energy = 3000
    fill_data.size = 20
    fill = bpy.data.objects.new("fill", fill_data)
    sc.collection.objects.link(fill)
    fill.location = (18, -18, 10)
    fill.rotation_euler = (math.radians(60), 0, math.radians(45))
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 48
    sc.cycles.device = "CPU"
    sc.render.resolution_x = 900
    sc.render.resolution_y = 700
    sc.render.film_transparent = True
    sc.render.filepath = args.preview
    bpy.ops.render.render(write_still=True)
    print(f"[bombe] preview → {args.preview}")
