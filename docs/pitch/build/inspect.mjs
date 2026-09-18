import {FileBlob,PresentationFile} from '@oai/artifact-tool';
import fs from 'node:fs/promises';
const p=await PresentationFile.importPptx(await FileBlob.load('SIH_2026_PS_26168_NavDR_Final_6Slides.pptx'));
console.log((await p.inspect({kind:'slide,layout',maxChars:3000})).ndjson);
let s=p.slides.getItem(0);for(const [k,v] of Object.entries({slides:p.slides,shapes:s.shapes,images:s.images}))console.log(k,Object.getOwnPropertyNames(Object.getPrototypeOf(v)));
await fs.writeFile('docs/pitch/build/template.inspect.txt',(await p.inspect({kind:'shape,image,textbox',maxChars:18000})).ndjson);
