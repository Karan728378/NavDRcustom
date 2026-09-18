"""Linux resource checks. A guard can reduce risk, not guarantee absence of OOM."""
import shutil
from pathlib import Path
GIB=1024**3

class ResourcePause(RuntimeError):
    pass

def available_ram():
    values={line.split(':')[0]:int(line.split()[1])*1024 for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith(('MemAvailable:','MemTotal:'))}
    return values['MemAvailable']

def check_host(directory, ram_headroom_gib=0., additional_ram_bytes=0, additional_disk_bytes=0):
    if ram_headroom_gib and available_ram()<ram_headroom_gib*GIB+additional_ram_bytes:
        raise ResourcePause('Host RAM headroom too low; close other applications and resume the unchanged checkpoint/config')
    if shutil.disk_usage(directory).free<512*1024**2+additional_disk_bytes:
        raise ResourcePause('Disk headroom too low; free disk space and resume')
