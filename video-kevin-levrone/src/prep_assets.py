# Prepara imágenes: recorte de marcas/textos, reescalado Lanczos x2 y enfoque suave. Determinista.
from PIL import Image, ImageFilter, ImageOps
import os, glob
SRC='work/zip/imagenes videokevinlevrone/'
OUT='assets/img/'
# nombre destino: (archivo origen, recorte relativo l,t,r,b)
M={
 'pose_dos':('Kevin-Posing.jpg',(0,0,1,1)),
 'flex_portada':('PB48833wtmrk0.webp',(0,0,1,1)),
 'gym_barra':('barbell-weights-moody-gym_406939-18250.avif',(0,0,1,1)),
 'creatina':('gold-creatine-300-g.jpg',(0,0,1,1)),
 'joven_publico':('images (1).jpg',(0,0.06,0.88,1)),
 'yates':('images (10).jpg',(0,0,1,1)),
 'coleman':('images (11).jpg',(0,0,1,1)),
 'arnold':('images (12).jpg',(0,0,1,1)),
 'escenario':('images (13).jpg',(0,0,1,1)),
 'pecho_lateral':('images (14).jpg',(0,0,0.94,1)),
 'sandow':('images (15).jpg',(0,0,1,1)),
 'espalda':('images (16).jpg',(0,0,1,1)),
 'baltimore':('images (2).jpg',(0,0,1,1)),
 'adolescente':('images (3).jpg',(0,0,1,1)),
 'yates_levrone_bn':('images (4).jpg',(0,0,1,0.95)),
 'triceps':('images (5).jpg',(0,0.1,1,1)),
 'powerhouse':('images (6).jpg',(0,0,1,1)),
 'sudadera':('images (7).jpg',(0,0,1,1)),
 'brazos':('images (8).jpg',(0.06,0.04,1,1)),
 'bateria':('images (9).jpg',(0,0,1,1)),
 'estudio':('images.jpg',(0,0,1,1)),
 'clasica':('kevin-levrone-classic-photo-header.jpg',(0,0,1,1)),
 'revista':('s-l400.jpg',(0,0,1,1)),
}
os.makedirs(OUT,exist_ok=True)
import json
META={}
for k,(f,(l,t,r,b)) in M.items():
    im=Image.open(SRC+f)
    if im.mode=='RGBA':
        bg=Image.new('RGB',im.size,(255,255,255)); bg.paste(im,mask=im.split()[3]); im=bg
    im=im.convert('RGB'); w,h=im.size
    im=im.crop((int(l*w),int(t*h),int(r*w),int(b*h)))
    META[k]=list(im.size)  # tamaño original real (para no ampliar de más)
    s=max(1,min(2.4,1500/max(im.size)))
    im=im.resize((round(im.size[0]*s),round(im.size[1]*s)),Image.LANCZOS)
    im=im.filter(ImageFilter.UnsharpMask(radius=2,percent=60,threshold=2))
    im.save(OUT+k+'.jpg',quality=92)
    print(k,im.size)
json.dump(META,open(OUT+'meta.json','w'))
lg=Image.open('assets/logo_src.jpg').convert('RGB')
lg=lg.resize((640,640),Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=2,percent=50,threshold=1))
# máscara circular suave
m=Image.new('L',(2560,2560),0)
from PIL import ImageDraw
ImageDraw.Draw(m).ellipse((40,40,2520,2520),fill=255)
m=m.resize((640,640),Image.LANCZOS)
lg.putalpha(m); lg.save('assets/img/logo.png'); print('logo ok')

# Recorte del fondo blanco (relleno por inundación desde los bordes) para el trofeo y el producto
from PIL import ImageDraw
import numpy as np
for k in ('sandow','creatina'):
    im=Image.open(OUT+k+'.jpg').convert('RGB')
    w,h=im.size
    marked=im.copy()
    for xy in [(0,0),(w-1,0),(0,h-1),(w-1,h-1),(w//2,0),(w//2,h-1),(0,h//2),(w-1,h//2)]:
        if min(marked.getpixel(xy))>200:
            ImageDraw.floodfill(marked,xy,(255,0,255),thresh=40)
    a=np.array(marked); bgm=(a[:,:,0]==255)&(a[:,:,1]==0)&(a[:,:,2]==255)
    if k=='sandow':
        # huecos blancos encerrados (entre brazo y cuerpo): componentes grandes de casi-blanco
        o=np.array(im); white=(o.min(axis=2)>215)&~bgm
        lab=Image.fromarray((white*255).astype(np.uint8))
        seen=np.zeros_like(white)
        for (yy,xx) in np.argwhere(white)[::97]:
            if seen[yy,xx]: continue
            tmp=lab.copy(); ImageDraw.floodfill(tmp,(int(xx),int(yy)),128)
            comp=np.array(tmp)==128; seen|=comp
            if comp.sum()>1500: bgm|=comp
    alpha=Image.fromarray(np.where(bgm,0,255).astype(np.uint8)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(1.5))
    rgba=im.copy(); rgba.putalpha(alpha)
    bb=alpha.getbbox(); rgba=rgba.crop(bb)
    rgba.save(OUT+k+'_cut.png'); print(k,'recortado',rgba.size)
