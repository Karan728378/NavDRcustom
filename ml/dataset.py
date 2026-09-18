"""Memory-mapped CPU trips; windows are generated only AFTER group assignment."""
from collections import OrderedDict
from pathlib import Path
import numpy as np
import torch
from torch.utils.data import Dataset
from common import read

class Windows(Dataset):
    def __init__(self,root,split,window,period_ns):
        self.root=Path(root);self.meta=read(self.root/'manifest.json');self.window=window;self.index=[];self.cache=OrderedDict()
        for trip in self.meta['trips']:
            if trip['split']!=split:continue
            a=np.load(self.root/trip['array'],mmap_mode='r')
            gaps=np.r_[0,np.cumsum(np.abs(np.diff(a[:,0])-period_ns)>period_ns*.1)]
            for end in range(window-1,len(a)):
                if gaps[end]==gaps[end-window+1]:self.index.append((trip['array'],end))
        if not self.index:raise ValueError('No contiguous windows for '+split)
    def __len__(self):return len(self.index)
    def __getitem__(self,i):
        path,end=self.index[i]
        if path not in self.cache:
            self.cache[path]=np.load(self.root/path,mmap_mode='r')
            if len(self.cache)>2:self.cache.popitem(last=False)
        a=self.cache[path]
        return torch.from_numpy(a[end-self.window+1:end+1,1:7].T.copy().astype('float32')),torch.tensor([a[end,7]],dtype=torch.float32)
