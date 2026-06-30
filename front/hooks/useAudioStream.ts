const openSocket = () => {
  // On récupère l'IP du .env, et on met une valeur de secours (fallback) au cas où
  const devIp = process.env.EXPO_PUBLIC_API_URL || '127.0.0.1';
  
  // Sur l'émulateur Android, localhost s'écrit 10.0.2.2, mais si tu as mis une vraie IP de box (ex: 192.168.x.x), elle fonctionne pour TOUTES les plateformes !
  const host = Platform.OS === 'android' && devIp === '127.0.0.1' 
    ? '10.0.2.2:8000' 
    : `${devIp}:8000`;

  const ws = new WebSocket(`ws://${host}/api/stream`);
  
  ws.binaryType = 'arraybuffer';
  wsRef.current = ws;
  
  // ... reste de ton code onopen, onmessage...
}