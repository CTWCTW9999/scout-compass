function decode64(value){const clean=value.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(clean),c=>c.charCodeAt(0));}
export async function unlockPrivateConfig(token,url='./private-config.json'){
  if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new Error('私人入口无效');
  const response=await fetch(url,{cache:'no-cache',credentials:'omit'});if(!response.ok)throw new Error('私人配置未加载');
  const blob=await response.json();
  const key=await crypto.subtle.importKey('raw',decode64(token),{name:'AES-GCM'},false,['decrypt']);
  const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode64(blob.iv)},key,decode64(blob.ciphertext));
  const config=JSON.parse(new TextDecoder().decode(raw));
  if(!/^[a-f0-9]{32}$/i.test(config.key)||!/^[a-f0-9]{32}$/i.test(config.code))throw new Error('私人配置格式不正确');
  return config;
}
