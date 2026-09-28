import { Capacitor, registerPlugin } from '@capacitor/core'
const KfeSecureStorage=registerPlugin('KfeSecureStorage')
const native=()=>Capacitor.getPlatform()==='android'
export const SecureStorage=Object.freeze({
 async set(key,value){if(!native())return false;await KfeSecureStorage.set({key,value:String(value??'')});return true},
 async get(key){if(!native())return null;const result=await KfeSecureStorage.get({key});return result?.value??''},
 async remove(key){if(!native())return false;await KfeSecureStorage.remove({key});return true}
})
