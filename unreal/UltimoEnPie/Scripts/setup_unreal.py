"""Prepara Ultimo en Pie dentro de Unreal Engine.

Que hace:
  1. Copia el maniqui animado de Unreal (contenido "Third Person") al proyecto, si no esta.
  2. Importa las texturas de SourceArt/ y genera los sonidos.
  3. Crea los materiales (terreno, revoque, tejas, madera, corteza, hojas, agua, zona...).
  4. Arma el mapa /Game/Maps/Isla con sol, cielo, nubes, niebla y postprocesado.

Como usarlo: en el editor, menu Tools > Execute Python Script... y elegir este archivo.
Se puede correr de nuevo cuantas veces haga falta.
"""
import math
import os
import random
import shutil
import struct
import wave

import unreal

PROJECT = unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir())
ART = os.path.join(PROJECT, 'SourceArt')
TEX, MAT, SND, MAP = '/Game/UEP/Textures', '/Game/UEP/Materials', '/Game/UEP/Sounds', '/Game/Maps/Isla'

AT = unreal.AssetToolsHelpers.get_asset_tools()
EAL = unreal.EditorAssetLibrary
MEL = unreal.MaterialEditingLibrary
MP = unreal.MaterialProperty


def log(msg):
    unreal.log('[UltimoEnPie] ' + msg)


# ───────────── 1. maniqui ─────────────
def copy_mannequin():
    dest = os.path.join(PROJECT, 'Content', 'Characters', 'Mannequins')
    if os.path.isdir(os.path.join(dest, 'Meshes')):
        log('El maniqui ya esta en el proyecto.')
        return
    root = os.path.normpath(os.path.join(unreal.Paths.convert_relative_path_to_full(unreal.Paths.engine_dir()), '..', 'Templates'))
    found = None
    for base, dirs, files in os.walk(root):
        if os.path.basename(base) == 'Mannequins' and os.path.basename(os.path.dirname(base)) == 'Characters' and 'Meshes' in dirs:
            if any(f.startswith('SKM_Manny') for f in os.listdir(os.path.join(base, 'Meshes'))):
                found = base
                break
    if not found:
        unreal.log_warning('[UltimoEnPie] No encontre el maniqui. Agregalo a mano: Content Drawer > Add > Add Feature or Content Pack > Third Person.')
        return
    shutil.copytree(found, dest)
    unreal.AssetRegistryHelpers.get_asset_registry().scan_paths_synchronous(['/Game/Characters'], True)
    log('Maniqui copiado desde ' + found)


# ───────────── 2. texturas y sonidos ─────────────
def import_files(paths, dest, prefix):
    tasks = []
    for p in paths:
        t = unreal.AssetImportTask()
        t.filename = p
        t.destination_path = dest
        t.destination_name = prefix + os.path.splitext(os.path.basename(p))[0]
        t.automated = True
        t.replace_existing = True
        t.save = True
        tasks.append(t)
    AT.import_asset_tasks(tasks)


def import_textures():
    files = [os.path.join(ART, f) for f in sorted(os.listdir(ART)) if f.lower().endswith(('.jpg', '.png'))]
    import_files(files, TEX, 'T_')
    for p in files:
        name = 'T_' + os.path.splitext(os.path.basename(p))[0]
        tex = unreal.load_asset(TEX + '/' + name)
        if not tex:
            continue
        if name.endswith('_n'):
            tex.set_editor_property('srgb', False)
            tex.set_editor_property('compression_settings', unreal.TextureCompressionSettings.TC_NORMALMAP)
            tex.set_editor_property('flip_green_channel', True)  # las normales de Poly Haven vienen en formato OpenGL
        elif name.endswith('_r'):
            tex.set_editor_property('srgb', False)
            tex.set_editor_property('compression_settings', unreal.TextureCompressionSettings.TC_MASKS)
        EAL.save_loaded_asset(tex)
    log('Texturas importadas: %d' % len(files))


def write_wav(path, samples, rate=44100):
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1.0, min(1.0, s)) * 32000)) for s in samples))


def make_sounds():
    rate, out = 44100, os.path.join(PROJECT, 'Saved', 'UEPSounds')
    os.makedirs(out, exist_ok=True)
    random.seed(3)
    shot, y = [], 0.0
    for i in range(int(rate * 0.45)):
        t = i / rate
        a = 0.08 + 0.6 * math.exp(-t * 30)          # filtro que se va cerrando
        y += a * ((random.random() * 2 - 1) - y)
        shot.append(y * math.exp(-t * 9) * 1.6 + math.sin(2 * math.pi * 55 * t) * math.exp(-t * 18) * 0.7)
    hit = [(1 if math.sin(2 * math.pi * 1500 * i / rate) > 0 else -1) * 0.25 * math.exp(-i / rate * 60) for i in range(int(rate * 0.06))]
    pick = [math.sin(2 * math.pi * (660 if i < rate * 0.07 else 990) * i / rate) * 0.3 * math.exp(-(i % int(rate * 0.07)) / rate * 25) for i in range(int(rate * 0.14))]
    files = []
    for name, data in (('Shot', shot), ('Hit', hit), ('Pickup', pick)):
        p = os.path.join(out, name + '.wav')
        write_wav(p, data, rate)
        files.append(p)
    import_files(files, SND, 'S_')
    log('Sonidos creados.')


# ───────────── 3. materiales ─────────────
def new_material(name):
    path = MAT + '/' + name
    if EAL.does_asset_exist(path):
        EAL.delete_asset(path)
    return AT.create_asset(name, MAT, unreal.Material, unreal.MaterialFactoryNew())


def tex(name):
    return unreal.load_asset(TEX + '/T_' + name)


def node(m, cls, x, y):
    return MEL.create_material_expression(m, cls, x, y)


def sample(m, t, x, y, kind='color', uv=None):
    e = node(m, unreal.MaterialExpressionTextureSample, x, y)
    e.set_editor_property('texture', t)
    e.set_editor_property('sampler_type', {
        'color': unreal.MaterialSamplerType.SAMPLERTYPE_COLOR,
        'normal': unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL,
        'masks': unreal.MaterialSamplerType.SAMPLERTYPE_MASKS,
    }[kind])
    if uv is not None:
        MEL.connect_material_expressions(uv, '', e, 'UVs')
    return e


def const(m, v, x, y):
    e = node(m, unreal.MaterialExpressionConstant, x, y)
    e.set_editor_property('r', v)
    return e


def const3(m, rgb, x, y):
    e = node(m, unreal.MaterialExpressionConstant3Vector, x, y)
    e.set_editor_property('constant', unreal.LinearColor(rgb[0], rgb[1], rgb[2], 1.0))
    return e


def binop(m, cls, a, a_out, b, b_out, x, y):
    e = node(m, cls, x, y)
    MEL.connect_material_expressions(a, a_out, e, 'A')
    MEL.connect_material_expressions(b, b_out, e, 'B')
    return e


def lerp(m, a, a_out, b, b_out, alpha, alpha_out, x, y):
    e = node(m, unreal.MaterialExpressionLinearInterpolate, x, y)
    MEL.connect_material_expressions(a, a_out, e, 'A')
    MEL.connect_material_expressions(b, b_out, e, 'B')
    MEL.connect_material_expressions(alpha, alpha_out, e, 'Alpha')
    return e


def finish(m):
    MEL.layout_material_expressions(m)
    MEL.recompile_material(m)
    EAL.save_loaded_asset(m)


def surface(name, tname, rough=1.0):
    """Material PBR con color x color de vértice (para teñir), normal y rugosidad."""
    m = new_material(name)
    c = sample(m, tex(tname + '_d'), -900, -300)
    vc = node(m, unreal.MaterialExpressionVertexColor, -900, 0)
    MEL.connect_material_property(binop(m, unreal.MaterialExpressionMultiply, c, 'RGB', vc, '', -500, -200), '', MP.MP_BASE_COLOR)
    MEL.connect_material_property(sample(m, tex(tname + '_n'), -900, 250, 'normal'), 'RGB', MP.MP_NORMAL)
    r = sample(m, tex(tname + '_r'), -900, 550, 'masks')
    MEL.connect_material_property(binop(m, unreal.MaterialExpressionMultiply, r, 'G', const(m, rough, -900, 850), '', -500, 600), '', MP.MP_ROUGHNESS)
    MEL.connect_material_property(r, 'R', MP.MP_AMBIENT_OCCLUSION)
    finish(m)


def terrain():
    """Mezcla pasto, tierra, roca y arena con los canales G, B y A del color de vértice."""
    m = new_material('M_Terrain')
    layers = ['grass', 'dirt', 'rock', 'sand']
    vc = node(m, unreal.MaterialExpressionVertexColor, -1400, 0)
    far = node(m, unreal.MaterialExpressionTextureCoordinate, -1700, -1400)
    far.set_editor_property('u_tiling', 0.23)
    far.set_editor_property('v_tiling', 0.23)
    cols, nrms = [], []
    for i, l in enumerate(layers):
        near = sample(m, tex(l + '_d'), -1400, -1400 + i * 260)
        big = sample(m, tex(l + '_d'), -1400, -1270 + i * 260, uv=far)
        cols.append(lerp(m, near, 'RGB', big, 'RGB', const(m, 0.4, -1150, -1300 + i * 260), '', -1000, -1350 + i * 260))
        nrms.append(sample(m, tex(l + '_n'), -1400, 300 + i * 260, 'normal'))
    col, nrm = cols[0], nrms[0]
    for i, ch in ((1, 'G'), (2, 'B'), (3, 'A')):
        col = lerp(m, col, '', cols[i], '', vc, ch, -700 + i * 150, -600)
        nrm = lerp(m, nrm, 'RGB' if i == 1 else '', nrms[i], 'RGB', vc, ch, -700 + i * 150, 500)
    MEL.connect_material_property(binop(m, unreal.MaterialExpressionMultiply, col, '', vc, 'R', -100, -500), '', MP.MP_BASE_COLOR)
    MEL.connect_material_property(nrm, '', MP.MP_NORMAL)
    MEL.connect_material_property(const(m, 0.92, -300, 200), '', MP.MP_ROUGHNESS)
    finish(m)


def foliage(name, tname):
    m = new_material(name)
    m.set_editor_property('blend_mode', unreal.BlendMode.BLEND_MASKED)
    m.set_editor_property('two_sided', True)
    m.set_editor_property('opacity_mask_clip_value', 0.4)
    try:
        m.set_editor_property('shading_model', unreal.MaterialShadingModel.MSM_TWO_SIDED_FOLIAGE)
        foliage_ok = True
    except Exception:
        foliage_ok = False
    c = sample(m, tex(tname), -900, -200)
    vc = node(m, unreal.MaterialExpressionVertexColor, -900, 100)
    base = binop(m, unreal.MaterialExpressionMultiply, c, 'RGB', vc, '', -500, -150)
    MEL.connect_material_property(base, '', MP.MP_BASE_COLOR)
    MEL.connect_material_property(c, 'A', MP.MP_OPACITY_MASK)
    MEL.connect_material_property(const(m, 0.7, -500, 150), '', MP.MP_ROUGHNESS)
    if foliage_ok:  # la luz atraviesa las hojas
        MEL.connect_material_property(binop(m, unreal.MaterialExpressionMultiply, base, '', const3(m, (0.6, 0.75, 0.3), -900, 300), '', -500, 300), '', MP.MP_SUBSURFACE_COLOR)
    finish(m)


def water():
    m = new_material('M_Water')
    MEL.connect_material_property(const3(m, (0.015, 0.05, 0.065), -600, -300), '', MP.MP_BASE_COLOR)
    MEL.connect_material_property(const(m, 0.035, -600, -150), '', MP.MP_ROUGHNESS)
    MEL.connect_material_property(const(m, 0.6, -600, -50), '', MP.MP_SPECULAR)
    normals = []
    for i, (tile, sx, sy) in enumerate(((620.0, 0.012, 0.007), (260.0, -0.008, 0.011))):
        uv = node(m, unreal.MaterialExpressionTextureCoordinate, -1300, 100 + i * 300)
        uv.set_editor_property('u_tiling', tile)
        uv.set_editor_property('v_tiling', tile)
        pan = node(m, unreal.MaterialExpressionPanner, -1050, 100 + i * 300)
        pan.set_editor_property('speed_x', sx)
        pan.set_editor_property('speed_y', sy)
        MEL.connect_material_expressions(uv, '', pan, 'Coordinate')
        normals.append(sample(m, tex('sand_n'), -800, 100 + i * 300, 'normal', uv=pan))
    mix = lerp(m, normals[0], 'RGB', normals[1], 'RGB', const(m, 0.5, -600, 700), '', -450, 300)
    flat = lerp(m, mix, '', const3(m, (0.0, 0.0, 1.0), -600, 800), '', const(m, 0.55, -600, 900), '', -250, 400)
    MEL.connect_material_property(flat, '', MP.MP_NORMAL)
    finish(m)


def glow(name, rgb, strength, opacity=None):
    m = new_material(name)
    m.set_editor_property('shading_model', unreal.MaterialShadingModel.MSM_UNLIT)
    m.set_editor_property('blend_mode', unreal.BlendMode.BLEND_ADDITIVE)
    m.set_editor_property('two_sided', True)
    e = binop(m, unreal.MaterialExpressionMultiply, const3(m, rgb, -700, -100), '', const(m, strength, -700, 100), '', -400, 0)
    MEL.connect_material_property(e, '', MP.MP_EMISSIVE_COLOR)
    if opacity is not None:
        MEL.connect_material_property(const(m, opacity, -400, 200), '', MP.MP_OPACITY)
    finish(m)


def color_param():
    m = new_material('M_Color')
    p = node(m, unreal.MaterialExpressionVectorParameter, -600, -100)
    p.set_editor_property('parameter_name', 'Color')
    p.set_editor_property('default_value', unreal.LinearColor(0.8, 0.8, 0.8, 1.0))
    MEL.connect_material_property(p, '', MP.MP_BASE_COLOR)
    MEL.connect_material_property(const(m, 0.5, -600, 150), '', MP.MP_ROUGHNESS)
    finish(m)


def make_materials():
    terrain()
    for name, tname, rough in (('M_Plaster', 'plaster', 1.0), ('M_Concrete', 'concrete', 1.0), ('M_Roof', 'roof', 0.9), ('M_Wood', 'floor', 1.0),
                               ('M_Bark', 'bark', 1.0), ('M_PineBark', 'pinebark', 1.0), ('M_Rock', 'rock', 1.0)):
        surface(name, tname, rough)
    foliage('M_Leaves', 'leaves')
    foliage('M_Needles', 'needles')
    water()
    glow('M_ZoneWall', (0.15, 0.45, 1.0), 0.6)
    glow('M_Tracer', (1.0, 0.75, 0.4), 30.0)
    color_param()
    log('Materiales creados.')


# ───────────── 4. mapa ─────────────
def build_level():
    les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    if EAL.does_asset_exist(MAP):
        les.load_level(MAP)
        for a in eas.get_all_level_actors():
            eas.destroy_actor(a)
    else:
        les.new_level(MAP)

    def spawn(cls, loc=(0, 0, 0), pitch=0.0, yaw=0.0):
        return eas.spawn_actor_from_class(cls, unreal.Vector(*loc), unreal.Rotator(pitch=pitch, yaw=yaw, roll=0.0))

    sun = spawn(unreal.DirectionalLight, (0, 0, 3000), pitch=-16.0, yaw=35.0)   # sol bajo de la tarde
    sc = sun.get_component_by_class(unreal.DirectionalLightComponent)
    sc.set_editor_property('mobility', unreal.ComponentMobility.MOVABLE)
    sc.set_editor_property('intensity', 10.0)
    sc.set_editor_property('atmosphere_sun_light', True)
    spawn(unreal.SkyAtmosphere)
    sky = spawn(unreal.SkyLight, (0, 0, 2000))
    skc = sky.get_component_by_class(unreal.SkyLightComponent)
    skc.set_editor_property('mobility', unreal.ComponentMobility.MOVABLE)
    skc.set_editor_property('real_time_capture', True)
    spawn(unreal.VolumetricCloud)
    fog = spawn(unreal.ExponentialHeightFog, (0, 0, -300))
    fc = fog.get_component_by_class(unreal.ExponentialHeightFogComponent)
    fc.set_editor_property('fog_density', 0.015)
    fc.set_editor_property('volumetric_fog', True)
    pp = spawn(unreal.PostProcessVolume)
    pp.set_editor_property('unbound', True)
    s = pp.get_editor_property('settings')
    for key, value in (('auto_exposure_bias', 0.3), ('bloom_intensity', 0.45), ('vignette_intensity', 0.35), ('film_grain_intensity', 0.12)):
        try:
            s.set_editor_property('override_' + key, True)
            s.set_editor_property(key, value)
        except Exception:
            pass
    pp.set_editor_property('settings', s)
    spawn(unreal.PlayerStart, (0, 0, 20000))

    world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
    gm = unreal.load_class(None, '/Script/UltimoEnPie.UEPGameMode')
    if gm:
        world.get_world_settings().set_editor_property('default_game_mode', gm)
    les.save_current_level()
    log('Mapa listo: ' + MAP + '. Apreta Play (Alt+P) para jugar.')


def main():
    with unreal.ScopedSlowTask(5, 'Preparando Ultimo en Pie...') as task:
        task.make_dialog(True)
        for step in (copy_mannequin, import_textures, make_sounds, make_materials, build_level):
            task.enter_progress_frame(1, step.__name__)
            step()


main()
