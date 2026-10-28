"""Pinned Harmony vocabularies prepared on CPU nodes for offline GPU serving."""
import hashlib
import json
from pathlib import Path
import sys
import urllib.request

FILES = {
    'o200k_base.tiktoken': '446a9538cb6c348e3516120d7c08b09f57c36495e2acfffe59a5bf8b0cfb1a2d',
    'cl100k_base.tiktoken': '223921b76ee99bde995b7ff738513eef100fb51d18c93597a113bcffe865b2a7',
}


def verify(model):
    folder=Path(model)/'harmony-encodings'
    manifest=json.loads((folder/'manifest.json').read_text())
    if manifest.get('sha256') != FILES:
        raise ValueError('Harmony vocabulary manifest mismatch')
    for name,digest in FILES.items():
        if hashlib.sha256((folder/name).read_bytes()).hexdigest()!=digest:
            raise ValueError('Harmony vocabulary checksum mismatch: '+name)


def ready(model, kind):
    if not kind:return True
    if kind!='harmony':return False
    try:verify(model)
    except (OSError,ValueError):return False
    return True


def install(model):
    folder=Path(model)/'harmony-encodings';folder.mkdir(parents=True,exist_ok=True)
    for name,digest in FILES.items():
        path=folder/name
        if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest()==digest:continue
        url='https://openaipublic.blob.core.windows.net/encodings/'+name
        with urllib.request.urlopen(url,timeout=90) as response:data=response.read()
        if hashlib.sha256(data).hexdigest()!=digest:raise ValueError('Unexpected official vocabulary hash: '+name)
        temporary=path.with_suffix('.partial');temporary.write_bytes(data);temporary.replace(path)
    marker=folder/'manifest.tmp';marker.write_text(json.dumps({'sha256':FILES,'source':'OpenAI public tiktoken encodings; expected hashes from openai/tiktoken'},indent=2)+'\n');marker.replace(folder/'manifest.json')
    verify(model)
    print('HARMONY_ENCODINGS_READY: two pinned vocabularies; no GPU network access required')


if __name__=='__main__':install(sys.argv[1])
