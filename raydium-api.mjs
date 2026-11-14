import {Connection, PublicKey, VersionedTransaction} from '@solana/web3.js';
import {getMint, getAssociatedTokenAddress, getAccount, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID} from '@solana/spl-token';
import {Raydium, TxVersion, DEVNET_PROGRAM_ID, DEV_API_URLS, getCpmmPdaAmmConfigId} from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';

const RPC='https://api.devnet.solana.com';
const GENESIS='EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
const WSOL='So11111111111111111111111111111111111111112';
const connection=new Connection(RPC,'confirmed');
const hits=new Map();
let lastGenesisCheck=0;
let checkedGenesis=false;
function error(message,status=400){const e=new Error(message);e.httpStatus=status;throw e}
function amount(text,decimals){
 if(typeof text!=='string'||! /^(0|[1-9]\d{0,15})(\.\d{1,9})?$/.test(text))error('Enter a positive decimal amount without exponent notation.');
 const [whole,fraction='']=text.split('.');
 if(fraction.length>decimals)error('Amount exceeds mint decimal precision.');
 const raw=BigInt(whole+fraction.padEnd(decimals,'0'));
 if(raw<=0n||raw>18446744073709551615n)error('Amount is outside SPL token limits.');
 return new BN(raw.toString());
}
async function mintInfo(address){
 const key=new PublicKey(address);
 const account=await connection.getAccountInfo(key,'confirmed');
 if(!account||(!account.owner.equals(TOKEN_PROGRAM_ID)&&!account.owner.equals(TOKEN_2022_PROGRAM_ID)))error('One of the supplied addresses is not a Devnet SPL token mint.');
 const m=await getMint(connection,key,'confirmed',account.owner);
 return {address:key.toBase58(),decimals:m.decimals,programId:account.owner.toBase58(),key,ownerProgram:account.owner};
}
async function balanceCheck(owner,info,needed){
 if(info.address===WSOL){
  const bal=await connection.getBalance(owner,'confirmed');
  if(BigInt(bal)<BigInt(needed.toString())+200000000n)error('Not enough Devnet SOL for wrapped SOL deposit plus a reserve for pool rent/fees.');
  return;
 }
 const ata=await getAssociatedTokenAddress(info.key,owner,false,info.ownerProgram);
 let held=0n;
 try{held=(await getAccount(connection,ata,'confirmed',info.ownerProgram)).amount}catch(e){if(!String(e.name).includes('TokenAccountNotFound'))throw e}
 if(held<BigInt(needed.toString()))error('Wallet does not hold enough of mint '+info.address);
}
export async function buildDevnetPool(req){
 const now=Date.now();
 const ip=req.socket.remoteAddress||'unknown';
 const list=(hits.get(ip)||[]).filter(t=>now-t<60000);
 if(list.length>=4)error('Please wait before requesting another pool transaction.',429);
 list.push(now);hits.set(ip,list);
 if(hits.size>2000){for(const [k,v] of hits)if(v.every(t=>now-t>60000))hits.delete(k)}
 const chunks=[];let length=0;
 for await(const chunk of req){length+=chunk.length;if(length>2048)error('Request is too large.',413);chunks.push(chunk)}
 let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{error('Invalid JSON')}
 if(!input||typeof input!=='object')error('Invalid input');
 const owner=new PublicKey(input.owner);
 const mintA=new PublicKey(input.mintA),mintB=new PublicKey(input.mintB);
 if(mintA.equals(mintB))error('Token and quote mint must differ.');
 if(mintA.equals(owner)||mintB.equals(owner))error('Wallet address is not a mint.');
 if(!checkedGenesis||now-lastGenesisCheck>3600000){
  const hash=await connection.getGenesisHash();
  if(hash!==GENESIS)error('RPC is not Solana Devnet.',503);
  checkedGenesis=true;lastGenesisCheck=now;
 }
 const [a,b]=await Promise.all([mintInfo(mintA),mintInfo(mintB)]);
 const amountA=amount(input.amountA,a.decimals),amountB=amount(input.amountB,b.decimals);
 const sol=await connection.getBalance(owner,'confirmed');
 if(sol<250000000)error('Your wallet needs Devnet SOL for pool rent and transaction fees.');
 await Promise.all([balanceCheck(owner,a,amountA),balanceCheck(owner,b,amountB)]);
 const raydium=await Raydium.load({connection,owner,cluster:'devnet',urlConfigs:DEV_API_URLS,disableFeatureCheck:true,blockhashCommitment:'confirmed'});
 const configs=await raydium.api.getCpmmConfigs();
 const base=configs.find(c=>Number(c.index)===0);
 if(!base)error('Raydium Devnet fee tier 0 is unavailable.',503);
 const feeConfig={...base,id:getCpmmPdaAmmConfigId(DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,base.index).publicKey.toBase58()};
 const result=await raydium.cpmm.createPool({
  programId:DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
  poolFeeAccount:DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC,
  mintA:{address:a.address,decimals:a.decimals,programId:a.programId},
  mintB:{address:b.address,decimals:b.decimals,programId:b.programId},
  mintAAmount:amountA,mintBAmount:amountB,startTime:new BN(0),
  feeConfig,associatedOnly:false,ownerInfo:{useSOLBalance:a.address===WSOL||b.address===WSOL},
  txVersion:TxVersion.V0,computeBudgetConfig:{units:600000,microLamports:100000}
 });
 const poolId=result.extInfo?.address?.poolId?.toBase58();
 if(!poolId)error('Raydium did not return a pool address.',503);
 if(await connection.getAccountInfo(new PublicKey(poolId),'confirmed'))error('A pool for this pair and fee tier already exists: '+poolId,409);
 const tx=result.transaction;
 if(!(tx instanceof VersionedTransaction))error('Raydium did not return a versioned transaction.',503);
 if(Array.isArray(result.signers)&&result.signers.length)tx.sign(result.signers);
 const feePayer=tx.message.staticAccountKeys[0]?.toBase58();
 if(feePayer!==owner.toBase58())error('Unexpected fee payer in Raydium transaction.',503);
 const program=DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM.toBase58();
 if(!tx.message.staticAccountKeys.some(k=>k.toBase58()===program))error('Transaction does not reference the Raydium Devnet CPMM program.',503);
 return {transaction:Buffer.from(tx.serialize()).toString('base64'),poolId,programId:program,network:'devnet',feeTierIndex:0,mintA:a.address,mintB:b.address,amountA:input.amountA,amountB:input.amountB};
}
