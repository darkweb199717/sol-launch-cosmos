import {copyFile,mkdir} from 'node:fs/promises';
await mkdir('vendor',{recursive:true});
await copyFile('node_modules/@solana/web3.js/lib/index.iife.min.js','vendor/solana-web3.iife.min.js');
console.log('Local Solana web3.js bundle installed in vendor/');
