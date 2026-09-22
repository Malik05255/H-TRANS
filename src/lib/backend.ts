import { invoke } from '@tauri-apps/api/core';
import { listen,type UnlistenFn } from '@tauri-apps/api/event';
import type {AndroidDevice,TransferProgress,WhatsAppVariant} from '../types';
export const backend={
 detectDevice:()=>invoke<AndroidDevice|null>('detect_android_device'),
 backupWhatsApp:(variant:WhatsAppVariant,destination:string)=>invoke<string>('backup_whatsapp',{variant,destination}),
 restoreWhatsApp:(backupFile:string,variant:WhatsAppVariant)=>invoke<void>('restore_whatsapp',{backupFile,variant}),
 onProgress:(handler:(p:TransferProgress)=>void):Promise<UnlistenFn>=>listen<TransferProgress>('transfer-progress',e=>handler(e.payload))
};
