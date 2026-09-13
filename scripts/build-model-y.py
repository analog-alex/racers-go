import bpy, math, os, json
from mathutils import Vector
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(name,color,rough=.4,metal=0,coat=0,emission=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;p.inputs['Coat Weight'].default_value=coat
 if emission:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
 return m
paint=mat('MAT-pearl-white',(.78,.82,.83),.26,coat=.65);glass=mat('MAT-smoked-glass',(.025,.052,.073),.17,coat=.8);trim=mat('MAT-satin-black',(.015,.019,.023),.48);rubber=mat('MAT-tyre',(.016,.018,.021),.87);alloy=mat('MAT-machined-alloy',(.42,.46,.49),.28,1);darkalloy=mat('MAT-aero-wheel',(.045,.052,.061),.35);red=mat('MAT-tail-lamp',(.65,.015,.02),.24,emission=.6);led=mat('MAT-headlamp',(.8,.93,1),.2,emission=.7)
def mesh(name,verts,faces,material,bevel=0):
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new('GEO-'+name,me);bpy.context.collection.objects.link(o);o.data.materials.append(material)
 for p in me.polygons:p.use_smooth=True
 if bevel:b=o.modifiers.new('Soft edges','BEVEL');b.width=bevel;b.segments=3
 return o
def box(name,loc,size,material,bevel=.025,parent=None):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name='GEO-'+name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material)
 if bevel:b=o.modifiers.new('Soft edges','BEVEL');b.width=bevel;b.segments=3;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
 if parent:o.parent=parent
 return o
def loft(name,sections,material):
 verts=[]
 for x,w,b,s,t in sections:
  verts.extend([(x,-w*.72,b),(x,-w,b+.09),(x,-w,s),(x,-w*.86,t-.025),(x,-w*.55,t),(x,w*.55,t),(x,w*.86,t-.025),(x,w,s),(x,w,b+.09),(x,w*.72,b)])
 faces=[tuple(range(9,-1,-1))]
 for i in range(len(sections)-1):
  for j in range(10):faces.append((i*10+j,i*10+(j+1)%10,(i+1)*10+(j+1)%10,(i+1)*10+j))
 faces.append(tuple(range((len(sections)-1)*10,len(sections)*10)))
 return mesh(name,verts,faces,material,.035)
body=loft('Model-Y-body',[(-2.36,.72,.38,.73,.86),(-2.22,.88,.28,.89,.98),(-1.7,.96,.26,.95,1.05),(-.95,.97,.26,1.02,1.12),(.25,.97,.26,1.02,1.12),(1.4,.97,.28,1.01,1.13),(2.05,.9,.32,.94,1.06),(2.32,.78,.43,.85,.99)],paint)
# Wheel arches cut through the continuous body before the finishing bevel.
for x in [-1.43,1.43]:
 bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=.421,depth=2.6,location=(x,0,.385),rotation=(math.pi/2,0,0));c=bpy.context.object;c.name='GEO-arch-cutter';mod=body.modifiers.new('Wheel arch','BOOLEAN');mod.operation='DIFFERENCE';mod.object=c;bpy.context.view_layer.objects.active=body;bpy.ops.object.modifier_move_up(modifier=mod.name);bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(c,do_unlink=True)
loft('Model-Y-coupe-roof',[(-1.04,.84,1.02,1.065,1.1),(-.68,.80,1.04,1.15,1.43),(-.18,.74,1.06,1.29,1.65),(.55,.74,1.06,1.32,1.68),(1.12,.76,1.055,1.25,1.55),(1.76,.82,1.04,1.10,1.28),(2.04,.8,1.03,1.055,1.09)],glass)
# Continuous glazing avoids intersecting window panels at the curved roof.
def rail(name,points,material,radius):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=radius;c.bevel_resolution=3;p=c.splines.new('POLY');p.points.add(len(points)-1)
 for v,co in zip(p.points,points):v.co=(*co,1)
 o=bpy.data.objects.new('GEO-'+name,c);bpy.context.collection.objects.link(o);o.data.materials.append(material);bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False)
for side in [-1,1]:
 rail('roof-rail'+str(side),[(x,side*y,z) for x,y,z in [(-1.02,.725,1.10),(-.68,.689,1.408),(-.18,.637,1.628),(.55,.637,1.658),(1.12,.654,1.528),(1.76,.707,1.258),(2.04,.689,1.07)]],paint,.036)
 rail('B-pillar'+str(side),[(.23,side*.748,1.07),(.23,side*.748,1.30),(.23,side*.642,1.656)],trim,.032)
 rail('window-belt'+str(side),[(-1.02,side*.80,1.068),(-.18,side*.745,1.078),(.55,side*.748,1.078),(1.3,side*.791,1.071),(2.0,side*.79,1.05)],paint,.026)
 box('sill'+str(side),(0,side*.951,.31),(2.1,.075,.13),trim,.035)
 for x in [-.15,.96]:box('flush-door-handle'+str(side)+str(x),(x,side*.97,1.025),(.23,.025,.035),trim,.014)
 box('mirror-arm'+str(side),(-.76,side*.94,1.16),(.13,.23,.045),trim,.02)
 box('mirror'+str(side),(-.74,side*1.065,1.19),(.25,.16,.105),paint,.05)
 # Slim corner lamps sit just ahead of the nose skin.
 mesh('headlamp'+str(side),[(-2.378,side*.30,.78),(-2.362,side*.69,.773),(-2.354,side*.70,.834),(-2.378,side*.40,.831)],[(0,1,2,3)],trim,.008)
 mesh('daylight'+str(side),[(-2.389,side*.34,.816),(-2.374,side*.68,.810),(-2.372,side*.68,.828),(-2.389,side*.39,.833)],[(0,1,2,3)],led)
 box('rear-lamp'+str(side),(2.23,side*.58,.955),(.075,.44,.082),red,.025)
box('front-lower-intake',(-2.355,0,.48),(.07,1.15,.105),trim,.05)
box('rear-diffuser',(2.23,0,.47),(.15,1.37,.17),trim,.05)
box('rear-spoiler',(2.04,0,1.113),(.16,1.58,.037),trim,.02)
box('rear-plate',(2.331,0,.71),(.018,.37,.105),trim,.012)
# Small Tesla T on nose and tail, geometry rather than a texture dependency.
for x,z in [(-2.369,.76),(2.326,.91)]:
 box('badge-top'+str(x),(x,0,z),(.012,.105,.014),alloy,.003);box('badge-stem'+str(x),(x,0,z-.038),(.012,.018,.065),alloy,.003)
# Four explicitly authored steering and roll pivots survive glTF export as extras.
for x in [-1.43,1.43]:
 for side in [-1,1]:
  steer=bpy.data.objects.new('GEO-steer-'+str(x)+'-'+str(side),None);bpy.context.collection.objects.link(steer);steer.location=(x,side*.895,.385)
  if x<0:steer['generatedFrontWheel']=True
  roll=bpy.data.objects.new('GEO-wheel-'+str(x)+'-'+str(side),None);bpy.context.collection.objects.link(roll);roll.parent=steer;roll['generatedWheel']=True;roll['rollAxis']='z';roll['radius']=.375
  profile=[(-.145,.29),(-.133,.345),(-.10,.375),(.10,.375),(.133,.345),(.145,.29)]
  verts=[(r*math.cos(i*math.tau/64),y,r*math.sin(i*math.tau/64)) for y,r in profile for i in range(64)]
  faces=[]
  for j in range(len(profile)-1):
   for i in range(64):faces.append((j*64+i,j*64+(i+1)%64,(j+1)*64+(i+1)%64,(j+1)*64+i))
  o=mesh('tyre',verts,faces,rubber);o.parent=roll
  def disk(name,radius,depth,y,material):
   bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=radius,depth=depth,location=(0,y,0),rotation=(math.pi/2,0,0));o=bpy.context.object;o.name='GEO-'+name;bpy.ops.object.transform_apply(location=False,rotation=True,scale=True);o.data.materials.append(material);o.parent=roll
   for f in o.data.polygons:f.use_smooth=True
   return o
  disk('aero-rim',.287,.025,side*.145,darkalloy);disk('hub',.07,.038,side*.17,alloy)
  for i in range(5):
   angle=i*math.tau/5+.2
   o=box('alloy-spoke',(math.cos(angle)*.156,side*.166,math.sin(angle)*.156),(.24,.022,.055),alloy,.014,roll);o.rotation_euler.y=-angle
  # A single short shoulder marker helps rotation read from the chase camera.
  marker=box('tyre-marker',(0,side*.138,.331),(.065,.009,.024),alloy,.005,roll)
# Recalculate face normals and apply mesh modifiers before export.
for o in list(bpy.context.scene.objects):
 if o.type!='MESH':continue
 bpy.context.view_layer.objects.active=o;o.select_set(True)
 for mod in list(o.modifiers):
  try:bpy.ops.object.modifier_apply(modifier=mod.name)
  except RuntimeError:pass
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT');o.select_set(False)
model_objects=list(bpy.context.scene.objects)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'assets/blender/tesla-model-y.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT,'public/models/tesla-model-y.glb'),export_format='GLB',export_apply=True,export_yup=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
# A studio image for checking the exported asset's silhouette and materials.
bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object;floor.name='GEO-studio-floor';floor.data.materials.append(mat('MAT-studio',(.10,.135,.16),.85))
for loc,power,size in [((-4,-5,7),1600,5),((3,4,6),2200,4),((0,-1,7),900,3)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,.7))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(-6.8,-6.5,3.6));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,.85))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=6.8
scene=bpy.context.scene;scene.camera=cam;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_x=1100;scene.render.resolution_y=750;scene.render.resolution_percentage=100;scene.world.color=(.22,.22,.22);scene.render.filepath=os.path.join(ROOT,'assets/blender/tesla-model-y.png');bpy.ops.render.render(write_still=True)
print(json.dumps({'glb_bytes':os.path.getsize(os.path.join(ROOT,'public/models/tesla-model-y.glb')),'triangles':sum(len(o.data.polygons) for o in model_objects if o.type=='MESH')}))
