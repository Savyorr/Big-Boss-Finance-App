import { cp, mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { deflateRawSync } from 'node:zlib';
const root = resolve('release/Big Boss Finance');
await mkdir(resolve('release'), { recursive:true });
await rm(root, { recursive:true, force:true });
await mkdir(root);
await cp('dist', root + '/app', { recursive:true });
await cp('local-release/server.mjs', root + '/server.mjs');
await cp('local-release/Start Big Boss Finance.cmd', root + '/Start Big Boss Finance.cmd');
await cp('local-release/READ ME FIRST.md', root + '/READ ME FIRST.md');
// Standard ZIP (deflate, CRC32, UTF-8 filenames), without a platform ZIP dependency.
const entries=[];
async function walk(dir) { for (const e of await readdir(dir, { withFileTypes:true })) { const p=resolve(dir,e.name); if (e.isDirectory()) await walk(p); else entries.push(p); } }
await walk(root); entries.sort();
const table=Array.from({length:256},(_,n)=>{ for(let k=0;k<8;k++) n=n&1?0xedb88320^(n>>>1):n>>>1; return n>>>0; });
const crc32=b=>{ let c=0xffffffff; for(const v of b) c=table[(c^v)&255]^(c>>>8); return (c^0xffffffff)>>>0; };
let offset=0; const local=[], central=[];
for(const p of entries) {
 const raw=await readFile(p), compressed=deflateRawSync(raw), name=Buffer.from('Big Boss Finance/'+relative(root,p).replaceAll('\\','/'));
 const crc=crc32(raw), h=Buffer.alloc(30);
 h.writeUInt32LE(0x04034b50); h.writeUInt16LE(20,4); h.writeUInt16LE(0x800,6); h.writeUInt16LE(8,8); h.writeUInt16LE(33,12); h.writeUInt32LE(crc,14); h.writeUInt32LE(compressed.length,18); h.writeUInt32LE(raw.length,22); h.writeUInt16LE(name.length,26);
 const c=Buffer.alloc(46); c.writeUInt32LE(0x02014b50); c.writeUInt16LE(20,4); c.writeUInt16LE(20,6); c.writeUInt16LE(0x800,8); c.writeUInt16LE(8,10); c.writeUInt16LE(33,14); c.writeUInt32LE(crc,16); c.writeUInt32LE(compressed.length,20); c.writeUInt32LE(raw.length,24); c.writeUInt16LE(name.length,28); c.writeUInt32LE(offset,42);
 local.push(h,name,compressed); central.push(c,name); offset+=h.length+name.length+compressed.length;
}
const directory=Buffer.concat(central), end=Buffer.alloc(22);
end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length,8); end.writeUInt16LE(entries.length,10); end.writeUInt32LE(directory.length,12); end.writeUInt32LE(offset,16);
await writeFile('release/Big-Boss-Finance-Windows-local.zip',Buffer.concat([...local,directory,end]));
console.log('Prepared release/Big-Boss-Finance-Windows-local.zip (Node.js prerequisite; Windows execution still requires a Windows check).');
