// Retire only this legacy origin's own push registration. No message or API replay.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 try{const subscription=await self.registration.pushManager.getSubscription();if(subscription)await subscription.unsubscribe();}catch{/* The browser may be offline; unregister still retires this worker. */}
 try{for(const notification of await self.registration.getNotifications())notification.close();}catch{/* No access to another registration or origin. */}
 await self.registration.unregister();
})()));
