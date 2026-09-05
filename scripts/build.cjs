/* Only public website assets go into the deployment output. */
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dist');
fs.mkdirSync(out,{recursive:true});
for(const entry of fs.readdirSync(root).filter(name=>name.endsWith('.html'))){fs.copyFileSync(path.join(root,entry),path.join(out,entry));}
for(const directory of ['js','css','images']){fs.cpSync(path.join(root,directory),path.join(out,directory),{recursive:true});}
console.log('Public storefront built in dist.');
