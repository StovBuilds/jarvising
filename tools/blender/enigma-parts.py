# Enigma I parts library for entry 001 — the modelled replacement for the
# primitives in src/enigma/machine.ts.
#
# CONTRACT (this is what makes the swap safe):
#   • One object per part, NAMED exactly as machine.ts looks it up.
#   • Every part is authored CENTRED ON THE SAME LOCAL ORIGIN as the primitive
#     it replaces — machine.ts keeps all of its .position / .rotation logic and
#     just uses the library geometry instead of a BoxGeometry/CylinderGeometry.
#   • Coordinates are given in three.js's frame (Y up, +Z toward the viewer).
#     Blender is Z up, and the glTF exporter maps (x, y, z)_blender →
#     (x, z, −y)_gltf, so the helper B() writes a three (X, Y, Z) as the Blender
#     point (X, −Z, Y). Cylinders along three's Y are Blender's default; along
#     three's X they are rotated about Blender Y; along three's Z about Blender X.
#   • Materials are NOT exported (procedural shaders do not survive glTF); the
#     runtime assigns the same canvas/PBR materials it always used, by part name.
#     UVs are exported so the oak/crinkle canvases still map.
#
#   node ~/bin/blender-run.mjs tools/blender/enigma-parts.py \
#       --expect public/models/enigma.glb -- --out public/models/enigma.glb [--preview x.png]
import argparse, math, sys
import bpy, bmesh
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True)
ap.add_argument("--preview")
args = ap.parse_args(argv)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
if sc.world is None:
    sc.world = bpy.data.worlds.new("World")
sc.world.use_nodes = True

# three-frame helpers ------------------------------------------------------
def B(x, y, z):            # three (X, Y, Z) → Blender location
    return (x, -z, y)
def S(w, h, d):            # three box size (width X, height Y, depth Z) → Blender scale
    return (w, d, h)
ROT_X_AXIS = (0, math.pi / 2, 0)      # cylinder along three X
ROT_Z_AXIS = (math.pi / 2, 0, 0)      # cylinder along three Z (default is three Y)

def box(size, at, bevel=0.0, segs=2):
    bpy.ops.mesh.primitive_cube_add(size=1, location=B(*at))
    o = bpy.context.active_object
    o.scale = S(*size)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        m = o.modifiers.new("bevel", "BEVEL"); m.width = bevel; m.segments = segs; m.limit_method = "ANGLE"
    return o

def cyl(r, depth, at, axis="Y", verts=32, bevel=0.0, r2=None):
    rot = (0, 0, 0) if axis == "Y" else ROT_X_AXIS if axis == "X" else ROT_Z_AXIS
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=B(*at), rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=B(*at), rotation=rot)
    o = bpy.context.active_object
    if bevel > 0:
        m = o.modifiers.new("bevel", "BEVEL"); m.width = bevel; m.segments = 2; m.limit_method = "ANGLE"
    return o

def torus(major, minor, at, axis="Y", segs=40, msegs=10):
    rot = (0, 0, 0) if axis == "Y" else ROT_X_AXIS if axis == "X" else ROT_Z_AXIS
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=segs, minor_segments=msegs, location=B(*at), rotation=rot)
    return bpy.context.active_object

def finish(o):
    """apply modifiers + transforms so the origin is the world origin and the
    geometry sits at its authored local coordinates."""
    bpy.context.view_layer.objects.active = o
    for ob in bpy.data.objects: ob.select_set(False)
    o.select_set(True)
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.select_set(False)
    return o

def join(objs, name, uv="smart"):
    objs = [finish(o) for o in objs]
    for ob in bpy.data.objects: ob.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.data.name = name
    if uv == "smart":
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.01)
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35)) if hasattr(bpy.ops.object, "shade_smooth_by_angle") else bpy.ops.object.shade_smooth()
    o.select_set(False)
    return o

def knurl(o, axis_vec, period, depth=0.05):
    """Serrate a cylinder's rim: every other angular segment is pulled in."""
    bm = bmesh.new(); bm.from_mesh(o.data)
    ax = Vector(axis_vec).normalized()
    for v in bm.verts:
        p = v.co.copy()
        radial = p - ax * p.dot(ax)
        r = radial.length
        if r < 1e-6: continue
        # angle around the axis
        u = radial.normalized()
        ref = Vector((0, 0, 1)) if abs(ax.z) < 0.9 else Vector((1, 0, 0))
        e1 = (ref - ax * ref.dot(ax)).normalized(); e2 = ax.cross(e1)
        ang = math.atan2(u.dot(e2), u.dot(e1))
        k = int(round((ang + math.pi) / (2 * math.pi) * period))
        if k % 2 == 1 and r > 0.5 * max(v.co.length for v in [v]):
            v.co = p - radial * depth
    bm.to_mesh(o.data); bm.free()

parts = []
W, D, H, T = 3.0, 3.6, 1.1, 0.09
WALL_H, WALL_CY = 1.3, 0.1

# ── case (caseG-local) ─────────────────────────────────────────────────────
case_objs = [box((W, T, D), (0, -H / 2 + T / 2, 0), bevel=0.02)]
for (sx, sw, sz, sd) in [(0, W, -D / 2 + T / 2, T), (0, W, D / 2 - T / 2, T), (-W / 2 + T / 2, T, 0, D - 2 * T), (W / 2 - T / 2, T, 0, D - 2 * T)]:
    case_objs.append(box((sw, WALL_H, sd), (sx, WALL_CY, sz), bevel=0.025))
# top rim moulding
for (sx, sw, sz, sd) in [(0, W + 0.06, -D / 2 + T / 2, T + 0.06), (0, W + 0.06, D / 2 - T / 2, T + 0.06), (-W / 2 + T / 2, T + 0.06, 0, D - 2 * T), (W / 2 - T / 2, T + 0.06, 0, D - 2 * T)]:
    case_objs.append(box((sw, 0.07, sd), (sx, WALL_CY + WALL_H / 2 - 0.035, sz), bevel=0.02))
case = join(case_objs, "case")
parts.append(case)

# brass corner protectors, latch, hinges — separate part so it gets brass
hw = []
for cx in (-W / 2, W / 2):
    for cz in (-D / 2, D / 2):
        hw.append(box((0.16, 0.5, 0.02), (cx + (0.07 if cx < 0 else -0.07), WALL_CY - 0.2, cz + (0.005 if cz < 0 else -0.005)), bevel=0.003))
        hw.append(box((0.02, 0.5, 0.16), (cx + (0.005 if cx < 0 else -0.005), WALL_CY - 0.2, cz + (0.07 if cz < 0 else -0.07)), bevel=0.003))
# front latch plate + hasp
hw.append(box((0.26, 0.16, 0.03), (0, WALL_CY + 0.35, D / 2 + 0.01), bevel=0.004))
hw.append(box((0.10, 0.22, 0.05), (0, WALL_CY + 0.22, D / 2 + 0.03), bevel=0.006))
# back hinges (barrels along X at the top back edge)
for hx in (-0.9, 0.9):
    hw.append(cyl(0.035, 0.34, (hx, WALL_CY + WALL_H / 2 + 0.01, -D / 2 + 0.02), axis="X", verts=16))
hardware = join(hw, "caseHardware")
parts.append(hardware)

# leather handle — half torus on the left face (procedural version was a torus)
handle = join([torus(0.22, 0.035, (-W / 2 - 0.02, 0.05, 0), axis="X", segs=32, msegs=10)], "handle")
# D-handle: keep the upper half of the ring (three Y ≥ pivot → Blender Z),
# matching the procedural TorusGeometry(…, arc=π) rotated onto the left face
bm = bmesh.new(); bm.from_mesh(handle.data)
for v in list(bm.verts):
    if v.co.z < 0.05 - 0.001: bm.verts.remove(v)
bm.to_mesh(handle.data); bm.free()
parts.append(handle)

# ── lid board (lidPivot-local, centred like the primitive at (0,0.04,D/2)) ──
lid_objs = [box((W, 0.08, D), (0, 0, 0), bevel=0.02)]
# inner raised frame, on the inside face (−Y when closed)
for (sx, sw, sz, sd) in [(0, W - 0.2, -D / 2 + 0.14, 0.08), (0, W - 0.2, D / 2 - 0.14, 0.08), (-W / 2 + 0.14, 0.08, 0, D - 0.36), (W / 2 - 0.14, 0.08, 0, D - 0.36)]:
    lid_objs.append(box((sw, 0.06, sd), (sx, -0.07, sz), bevel=0.01))
# spare-bulb clip strip
lid_objs.append(box((0.7, 0.04, 0.12), (0.72, -0.06, 0.62), bevel=0.005))
lid = join(lid_objs, "lidBoard")
parts.append(lid)

# ── deck (chassis-local, centred like the primitive at (0,0.42,0.05)) ──────
deck_objs = [box((W - 0.26, 0.05, D - 0.5), (0, 0, 0), bevel=0.012)]
for rx in (-1.3, 1.3):
    for rz in (-1.45, -0.5, 0.5, 1.45):
        deck_objs.append(cyl(0.028, 0.02, (rx, 0.03, rz), verts=10))
# rotor window strip: a thin frame behind the rotors with three apertures suggested by raised lips
deck_objs.append(box((1.5, 0.03, 0.06), (0.1, 0.03, -0.83), bevel=0.004))
deck = join(deck_objs, "deck")
parts.append(deck)

# ── plates ──────────────────────────────────────────────────────────────────
lamp_plate = join([box((2.7, 0.04, 1.05), (0, 0, 0), bevel=0.01)] +
                  [cyl(0.024, 0.02, (x, 0.02, z), verts=8) for x in (-1.28, 1.28) for z in (-0.46, 0.46)], "lampPlate")
parts.append(lamp_plate)
pb_plate = join([box((2.72, 0.78, 0.05), (0, 0, 0), bevel=0.012)] +
                [cyl(0.03, 0.02, (x, y, 0.03), axis="Z", verts=8) for x in (-1.3, 1.3) for y in (-0.33, 0.33)], "pbPlate")
parts.append(pb_plate)

# ── lamp bezel (lamp-local: centred at the glass, sits on the plate) ───────
bez = torus(0.1, 0.02, (0, 0, 0), axis="Y", segs=48, msegs=8)
finish(bez); knurl(bez, (0, 0, 1), 48, 0.006)   # Blender Z == three Y
bezel = join([bez, cyl(0.105, 0.012, (0, -0.012, 0), verts=32, r2=0.095)], "lampBezel", uv=None)
parts.append(bezel)

# ── key (key-local: cap centred at its own centre; stem + ring separate) ───
cap = join([cyl(0.1, 0.035, (0, 0, 0), verts=36, bevel=0.012)], "keyCap", uv=None)
parts.append(cap)
ring = join([torus(0.098, 0.012, (0, 0, 0), axis="Y", segs=40, msegs=8)], "keyRing", uv=None)
parts.append(ring)
stem = join([cyl(0.045, 0.1, (0, 0, 0), verts=14, r2=0.05)], "keyStem", uv=None)
parts.append(stem)

# ── plug socket (socket-local: centred between the two jacks) ──────────────
boss = box((0.14, 0.2, 0.035), (0, 0, 0), bevel=0.006)
finish(boss)
cutters = []
for dy in (0.0375, -0.0375):
    c = cyl(0.026, 0.1, (0, dy, 0), axis="Z", verts=16); finish(c); cutters.append(c)
for c in cutters:
    m = boss.modifiers.new("hole", "BOOLEAN"); m.operation = "DIFFERENCE"; m.object = c
socket = join([boss], "plugSocket", uv=None)
for c in cutters: bpy.data.objects.remove(c)
parts.append(socket)
plug = join([cyl(0.034, 0.09, (0, 0, 0), axis="Z", verts=14, bevel=0.006), cyl(0.026, 0.06, (0, 0, 0.07), axis="Z", verts=12, r2=0.016)], "plug", uv=None)
parts.append(plug)

# ── rotor parts (holder-local, centred, axis along three X) ────────────────
wheel = cyl(0.3, 0.055, (0, 0, 0), axis="X", verts=80)
finish(wheel); knurl(wheel, (1, 0, 0), 80, 0.018)
rotor_wheel = join([wheel], "rotorWheel", uv=None)
parts.append(rotor_wheel)
rotor_ring = join([cyl(0.27, 0.085, (0, 0, 0), axis="X", verts=52)], "rotorRing", uv=None)
# Explicit UVs: the runtime letter canvas expects u = angle around the axis
# (0..1, one full wrap) and v = position across the ring width (0..1). Blender's
# primitive UVs put the side strip in half the texture with the caps over the
# other half, which sliced the letters and streaked cap texels across them.
bm = bmesh.new(); bm.from_mesh(rotor_ring.data)
uv_layer = bm.loops.layers.uv.verify()
xmin = min(v.co.x for v in bm.verts); xmax = max(v.co.x for v in bm.verts)
for f in bm.faces:
    if abs(f.normal.x) > 0.9:                       # cap: park it on one texel column
        for l in f.loops: l[uv_layer].uv = (0.001, 0.5)
        continue
    us = []
    for l in f.loops:
        ang = math.atan2(l.vert.co.z, l.vert.co.y)  # around the X axis (Blender Y/Z plane)
        us.append((ang / (2 * math.pi)) % 1.0)
    if max(us) - min(us) > 0.5:                     # seam face: unwrap past 1.0 instead of folding back
        us = [u + 1.0 if u < 0.5 else u for u in us]
    for l, u in zip(f.loops, us):
        l[uv_layer].uv = (u, (l.vert.co.x - xmin) / (xmax - xmin))
bm.to_mesh(rotor_ring.data); bm.free()
parts.append(rotor_ring)
core = cyl(0.24, 0.1, (0, 0, 0), axis="X", verts=32, bevel=0.01)
core_objs = [core] + [cyl(0.012, 0.012, (-0.052, math.cos(a) * 0.19, math.sin(a) * 0.19), axis="X", verts=6) for a in [i / 26 * 2 * math.pi for i in range(26)]]
rotor_core = join(core_objs, "rotorCore", uv=None)
parts.append(rotor_core)
plate_objs = [cyl(0.22, 0.03, (0, 0, 0), axis="X", verts=32, bevel=0.005)] + \
             [box((0.012, 0.03, 0.02), (-0.018, math.cos(a) * 0.19, math.sin(a) * 0.19)) for a in [i / 26 * 2 * math.pi for i in range(26)]]
rotor_plate = join(plate_objs, "rotorPlate", uv=None)
parts.append(rotor_plate)

# ── reflector, entry wheel (centred, axis X) ───────────────────────────────
refl = join([cyl(0.26, 0.12, (0, 0, 0), axis="X", verts=40, bevel=0.012), box((0.06, 0.28, 0.05), (-0.05, 0.25, 0.1))], "reflector", uv=None)
parts.append(refl)
entry = join([cyl(0.26, 0.09, (0, 0, 0), axis="X", verts=40, bevel=0.01)], "entryWheel", uv=None)
parts.append(entry)

# ── power knob (chassis-local, centred at knob base position) ──────────────
knob = join([cyl(0.14, 0.05, (0, 0, 0), verts=24, r2=0.16), box((0.06, 0.06, 0.2), (0, 0.045, 0), bevel=0.008)], "knob", uv=None)
parts.append(knob)

# ── key letters: real geometry, one part per letter (face up, cap-local) ──
for ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
    bpy.ops.object.text_add(location=(0, 0, 0))
    t = bpy.context.active_object
    t.data.body = ch
    t.data.size = 0.125
    t.data.extrude = 0.004
    t.data.align_x = "CENTER"
    t.data.align_y = "CENTER"
    bpy.ops.object.convert(target="MESH")
    t = bpy.context.active_object
    t.name = f"keyLetter_{ch}"; t.data.name = t.name
    finish(t)
    parts.append(t)

# ── export ─────────────────────────────────────────────────────────────────
for o in bpy.data.objects:
    o.select_set(o in parts)
bpy.ops.export_scene.gltf(
    filepath=args.out, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
    export_cameras=False, export_lights=False, export_normals=True, export_texcoords=True,
    export_materials="NONE",
)
print("[enigma-parts] " + ", ".join(f"{p.name}:{len(p.data.polygons)}" for p in parts))
print(f"[enigma-parts] faces={sum(len(p.data.polygons) for p in parts)} → {args.out}")

if args.preview:
    # lay the parts out in a row for a quick look
    x = -6.0
    for p in parts:
        p.location.x += x; x += 1.4
    cam_data = bpy.data.cameras.new("cam"); cam = bpy.data.objects.new("cam", cam_data); sc.collection.objects.link(cam)
    cam.location = (0, -9, 4); cam.rotation_euler = (math.radians(66), 0, 0); cam_data.lens = 28; sc.camera = cam
    ld = bpy.data.lights.new("key", "SUN"); ld.energy = 4; l = bpy.data.objects.new("key", ld); sc.collection.objects.link(l)
    l.rotation_euler = (math.radians(50), 0, math.radians(30))
    sc.render.engine = "CYCLES"; sc.cycles.samples = 32; sc.cycles.device = "CPU"
    sc.render.resolution_x = 1200; sc.render.resolution_y = 500; sc.render.film_transparent = True
    sc.render.filepath = args.preview
    bpy.ops.render.render(write_still=True)
