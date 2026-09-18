"""Exact network topology from js/ai-motion-estimator.js; random, UNTRAINED weights.
Batch window adapter replaces JS circular buffers with causal padding; no GNSS anchor wrapper.
"""
import torch
from torch import nn
from torch.nn import functional as F

class NavDRTCN(nn.Module):
    dilations=(1,1,2,2,4,4,16,16)
    def __init__(self):
        super().__init__()
        self.projection=nn.Conv1d(6,32,1,bias=False)
        self.projection_bias=nn.Parameter(torch.zeros(1,32,1))
        self.layers=nn.ModuleList(nn.Conv1d(32,32,6,dilation=d) for d in self.dilations)
        self.head=nn.Conv1d(32,1,1)
        for p in self.parameters():nn.init.uniform_(p,-.04,.04)
    def forward(self,x):
        x=torch.tanh(torch.tanh(self.projection(x))+self.projection_bias)
        for i,(layer,d) in enumerate(zip(self.layers,self.dilations)):
            if i%2==0:residual=x
            x=layer(F.pad(x,(5*d,0)))
            x=torch.tanh(x+residual if i%2 else x)
        return torch.tanh(self.head(x))[:,:,-1]
    def js_weights(self):
        # JS tap 0 is the current sample; Conv1d tap order runs oldest to newest.
        parts=[self.projection.weight.detach().flatten(),self.projection_bias.detach().flatten()]
        for layer in self.layers:parts += [layer.weight.detach().flip(-1).permute(0,2,1).flatten(),layer.bias.detach().flatten()]
        parts += [self.head.weight.detach().flatten(),self.head.bias.detach().flatten()]
        return torch.cat(parts).tolist()
