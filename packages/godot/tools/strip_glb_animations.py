#!/usr/bin/env python3
"""Writes a copy of a .glb without its animations (the KayKit Skeletons characters each carry the same ~90 animations,
4.8 MB apiece; the client takes the animations from one character and the meshes from the others).
Usage: strip_glb_animations.py in.glb out.glb"""
import json
import struct
import sys


def main(src: str, dst: str) -> None:
    data = open(src, 'rb').read()
    jlen, _ = struct.unpack('<II', data[12:20])
    j = json.loads(data[20:20 + jlen])
    off = 20 + jlen
    blen, _ = struct.unpack('<II', data[off:off + 8])
    binary = data[off + 8:off + 8 + blen]
    j.pop('animations', None)
    # keep only the accessors the remaining parts use, and only the buffer views under them
    used_acc: set[int] = set()
    for m in j.get('meshes', []):
        for p in m['primitives']:
            used_acc.update(p['attributes'].values())
            if 'indices' in p:
                used_acc.add(p['indices'])
    for s in j.get('skins', []):
        if 'inverseBindMatrices' in s:
            used_acc.add(s['inverseBindMatrices'])
    acc_map = {old: new for new, old in enumerate(sorted(used_acc))}
    accessors = [j['accessors'][o] for o in sorted(used_acc)]
    used_bv = sorted({a['bufferView'] for a in accessors})
    new_bin = bytearray()
    bv_map = {}
    views = []
    for o in used_bv:
        v = dict(j['bufferViews'][o])
        while len(new_bin) % 4:
            new_bin.append(0)
        start = v.get('byteOffset', 0)
        chunk = binary[start:start + v['byteLength']]
        v['byteOffset'] = len(new_bin)
        new_bin += chunk
        bv_map[o] = len(views)
        views.append(v)
    for a in accessors:
        a['bufferView'] = bv_map[a['bufferView']]
    # images keep their buffer views too (an embedded texture)
    for img in j.get('images', []):
        if 'bufferView' in img:
            o = img['bufferView']
            v = dict(j['bufferViews'][o])
            while len(new_bin) % 4:
                new_bin.append(0)
            start = v.get('byteOffset', 0)
            chunk = binary[start:start + v['byteLength']]
            v['byteOffset'] = len(new_bin)
            new_bin += chunk
            img['bufferView'] = len(views)
            views.append(v)
    for m in j.get('meshes', []):
        for p in m['primitives']:
            p['attributes'] = {k: acc_map[v] for k, v in p['attributes'].items()}
            if 'indices' in p:
                p['indices'] = acc_map[p['indices']]
    for s in j.get('skins', []):
        if 'inverseBindMatrices' in s:
            s['inverseBindMatrices'] = acc_map[s['inverseBindMatrices']]
    j['accessors'] = accessors
    j['bufferViews'] = views
    while len(new_bin) % 4:
        new_bin.append(0)
    j['buffers'] = [{'byteLength': len(new_bin)}]
    jb = json.dumps(j, separators=(',', ':')).encode()
    while len(jb) % 4:
        jb += b' '
    total = 12 + 8 + len(jb) + 8 + len(new_bin)
    with open(dst, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(jb), 0x4E4F534A) + jb)
        f.write(struct.pack('<II', len(new_bin), 0x004E4942) + bytes(new_bin))


main(sys.argv[1], sys.argv[2])
