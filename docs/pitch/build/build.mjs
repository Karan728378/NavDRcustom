process.env.RUNTIME_NODE_MODULES='/home/rimuru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
import fs from 'node:fs/promises';
import {FileBlob,PresentationFile} from '@oai/artifact-tool';
import {finalizePresentation} from '/home/rimuru/.codex/plugins/cache/openai-primary-runtime/presentations/26.905.11957/skills/presentations/container_tools/artifact_tool_utils.mjs';
const root='/home/rimuru/Downloads/Antigravity/SIH_Pototype';
const p=await PresentationFile.importPptx(await FileBlob.load(root+'/SIH_2026_PS_26168_NavDR_Final_6Slides.pptx'));
const navy='#17365D',blue='#146BCB',teal='#008C82',gray='#516171';
function txt(s,text,x,y,w,h,size=27,color=navy,bold=false,font='Arial'){
const t=s.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});t.text=text;t.text.style={typeface:font,fontSize:size,color,bold,autoFit:'none'};return t;
}
async function img(s,name,x,y,w,h){s.images.add({blob:new Uint8Array(await fs.readFile(root+'/docs/pitch/assets/'+name+'.png')),contentType:'image/png',fit:'contain',position:{left:x,top:y,width:w,height:h},alt:'Concept illustration: '+name});}
const titles=['TEKATHON-5.0 · 2026','IDEA TITLE','TECHNICAL APPROACH','FEASIBILITY AND VIABILITY','IMPACT AND BENEFITS','RESEARCH AND REFERENCES'];
for(let i=0;i<6;i++){
const s=p.slides.getItem(i);
for(const sh of [...s.shapes.items]){const pos=sh.position; if(!(pos?.top>=660&&pos?.width>1200))s.shapes.deleteById(sh.id);}
for(const im of [...s.images.items])if(im.frame.top>145)s.images.deleteById(im.id);
// The original master and its approved artwork remain attached.
txt(s,titles[i],280,35,790,70,i===3?36:40,navy,true,'Times New Roman');
if(i>0){txt(s,'NavDR  /  PS 26168',490,680,350,28,16,'#FFFFFF');txt(s,String(i+1),1190,680,35,28,16,'#FFFFFF',true);}
}
let s=p.slides.getItem(0);
await img(s,'hero',680,145,535,500);
txt(s,'NavDR',65,170,600,95,72,navy,true);
txt(s,'Smartphone navigation\nthrough GNSS outages',68,275,585,100,36,teal,true);
txt(s,'AI-ML based Intelligent Dead Reckoning\nsystem for seamless navigation',68,405,600,85,27,navy);
txt(s,'Problem Statement 26168\nISRO   •   Software   •   Miscellaneous',68,520,610,75,22,gray);
txt(s,'Concept illustration',990,628,240,22,15,gray);
s.speakerNotes.textFrame.setText('Working title and event artwork retained from supplied template. Confirm current SIH branding, portal theme and registered team details before submission. Product name is NavDR; no team identity was invented. Illustration is conceptual.');
s=p.slides.getItem(1);
txt(s,'Motion continuity when GNSS becomes unreliable',65,135,1150,55,32,teal,true);
await img(s,'road',35,215,745,375);
txt(s,'THE PROBLEM',820,220,385,30,19,blue,true);
txt(s,'GNSS loses coverage.\nIMU bias builds position error.',820,260,385,105,27);
txt(s,'THE RESPONSE',820,385,385,30,19,teal,true);
txt(s,'Combine phone motion sensors,\nvelocity estimates and road\nconstraints to bridge outages.',820,425,390,125,26);
txt(s,'GNSS available',85,595,210,30,19,blue,true);txt(s,'Dead reckoning',350,595,220,30,19,teal,true);txt(s,'Recovery',635,595,140,30,19,blue,true);
txt(s,'Validation target: peak outage error below 10% of outage distance',80,635,1120,30,22,navy,true);
s.speakerNotes.textFrame.setText('Target is an internal validation objective, not a general field result or verified ISRO mandate. Paths in the illustration are conceptual. Proactive NavIC-aware handoff remains planned.');
s=p.slides.getItem(2);
await img(s,'stack',60,145,490,475);
const steps=[['Phone IMU','Acceleration and rotation'],['Frame alignment','Fixed mounting configuration'],['TCN velocity','49,665 parameters; untrained demo'],['Planar EKF','State estimation and GNSS gating'],['Road HMM','Road-constrained position output']];
steps.forEach(([a,b],i)=>{txt(s,String(i+1).padStart(2,'0'),580,155+i*88,60,40,25,teal,true);txt(s,a,660,152+i*88,535,40,28,navy,true);txt(s,b,660,190+i*88,535,37,23,gray);});
txt(s,'Current: 100 Hz simulated IMU and replay',70,620,590,35,22,teal,true);txt(s,'Next: trained weights and device validation',680,620,550,35,22,gray);
s.speakerNotes.textFrame.setText('Conceptual processing layers, not additional phone hardware. Actual current system: untrained causal TCN, six-state planar EKF, imported OSM road matcher. TCN output uses explicit GNSS-anchor constraints, not learned drift suppression. Sources: https://arxiv.org/abs/1803.01271 ; https://valhalla.github.io/valhalla/meili/algorithms/ ; local implementation js/navigation-core.js and js/ai-motion-estimator.js.');
s=p.slides.getItem(3);
await img(s,'pyramid',45,190,370,415);
txt(s,'Prototype to field validation',65,140,1100,50,32,teal,true);
const values=[['Risk','Response'],['Mounting changes','Detect and realign'],['GNSS multipath spike','Gate inconsistent fixes'],['Late IMU samples','Flag timestamp gaps'],['Unfamiliar routes / phones','Evaluate held-out data']];
const table=s.tables.add({rows:5,columns:2,left:465,top:230,width:745,height:300,columnWidths:[340,405],values});
for(let r=0;r<5;r++)for(let c=0;c<2;c++){const cell=table.getCell(r,c);cell.fill=r===0?navy:(r%2?'#F1F5F8':'#FFFFFF');cell.text.style={typeface:'Arial',fontSize:r===0?25:23,color:r===0?'#FFFFFF':navy,bold:r===0};}
txt(s,'Upper stages planned',100,600,330,30,19,gray);
txt(s,'Working now',465,555,300,35,24,teal,true);txt(s,'Console, sensor simulation, EKF, road matching and replay',465,595,745,60,24);
s.speakerNotes.textFrame.setText('Pyramid represents project maturity, not the neural architecture. Native Android code and model training require device and dataset validation. No field reliability claim is made.');
s=p.slides.getItem(4);
txt(s,'Navigation continuity using an existing phone',65,140,1150,55,32,teal,true);
await img(s,'city',500,210,735,405);
const blocks=[['Drivers','Position awareness through\nshort GNSS outages'],['Fleets','Route continuity through\ntunnels and dense streets'],['Deployment goal','No dedicated vehicle\nsensor hardware']];
blocks.forEach(([a,b],i)=>{txt(s,a,65,225+i*125,410,35,28,navy,true);txt(s,b,65,267+i*125,420,75,25,gray);});
txt(s,'Measure error, recovery time, latency and phone energy use',65,620,1130,35,23,navy,true);
s.speakerNotes.textFrame.setText('Potential users and benefits, not deployed customers or measured safety outcomes. Field impact and budget-phone performance remain to be validated. No zero-cost or energy-saving claim.');
s=p.slides.getItem(5);
await img(s,'evidence',865,160,345,325);
const refs=[['IO-VNBD','Vehicle and smartphone motion data','https://github.com/onyekpeu/IO-VNBD'],['AI-IMU Dead-Reckoning','Learning-assisted inertial estimation','https://doi.org/10.1109/TIV.2020.2980758'],['Temporal Convolutional Networks','Causal sequence modelling','https://arxiv.org/abs/1803.01271'],['Valhalla Meili','HMM map matching','https://valhalla.github.io/valhalla/meili/algorithms/'],['Android GnssStatus','Satellite signal observations','https://developer.android.com/reference/android/location/GnssStatus']];
refs.forEach(([a,b,u],i)=>{const t=txt(s,a,65,152+i*69,760,32,25,navy,true);t.text.get(a).link={uri:u,isExternal:true};txt(s,b,65,183+i*69,750,31,20,gray);});
txt(s,'Synthetic prototype. TCN untrained. Field validation pending.',65,525,1140,45,23,gray);
let t=txt(s,'YouTube Demo',65,590,440,40,28,blue,true);t.text.get('YouTube Demo').link={uri:'https://youtu.be/GoU52CqyaNI?si=BRUkPWE7Z4fjoDyq',isExternal:true};
t=txt(s,'GitHub Repository',665,590,480,40,28,blue,true);t.text.get('GitHub Repository').link={uri:'https://github.com/Sudhanshu-01-ui/gps',isExternal:true};
txt(s,'youtu.be/GoU52CqyaNI',65,633,500,25,19,gray);txt(s,'github.com/Sudhanshu-01-ui/gps',665,633,520,25,19,gray);
s.speakerNotes.textFrame.setText('Research sources are linked in the slide. They do not establish equivalent NavDR performance. Project URLs supplied by the user: https://youtu.be/GoU52CqyaNI?si=BRUkPWE7Z4fjoDyq and https://github.com/Sudhanshu-01-ui/gps. Contents not independently verified in this session. Image generation prompts: docs/pitch/NavDR_Pitch_Blueprint.md.');
const candidate=root+'/docs/pitch/build/candidate.pptx';await(await PresentationFile.exportPptx(p)).save(candidate);
console.log('candidate saved');
const result=await finalizePresentation({workspaceDir:root,candidatePath:candidate,finalPath:root+'/docs/pitch/output/NavDR_Final.pptx',pythonExecutable:'/home/rimuru/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',integrityValidatorPath:'/home/rimuru/.codex/plugins/cache/openai-primary-runtime/presentations/26.905.11957/skills/presentations/container_tools/inspect_presentation_package_integrity.py',layoutValidatorPath:'/home/rimuru/.codex/plugins/cache/openai-primary-runtime/presentations/26.905.11957/skills/presentations/container_tools/inspect_presentation_layout_geometry.py',layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-heading-fit','--require-native-table-slide','4'],fontPolicy:{basis:'design',families:['Arial','Times New Roman']},explicitTotalSlideCount:6,requiredNativeTableOwnerSlides:[4],verifyArtifactToolImport:true,receiptPath:root+'/docs/pitch/build/validation.json'});console.log(result);
