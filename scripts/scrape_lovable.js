import https from 'https';

https.get('https://danielnotexist.lovable.app/', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    // Extract JS/CSS bundle links
    const jsLinks = data.match(/src="([^"]+\.js)"/g) || [];
    const cssLinks = data.match(/href="([^"]+\.css)"/g) || [];
    console.log("Found CSS:", cssLinks);
    console.log("Found JS:", jsLinks);
    
    // Fetch the main CSS to get colors/fonts
    if (cssLinks.length > 0) {
      const cssUrl = new URL(cssLinks[0].replace('href="', '').replace('"', ''), 'https://danielnotexist.lovable.app/');
      https.get(cssUrl, (cssRes) => {
        let cssData = '';
        cssRes.on('data', (chunk) => { cssData += chunk; });
        cssRes.on('end', () => {
          const rootVars = cssData.match(/:root\s*{([^}]+)}/);
          if (rootVars) console.log("CSS Variables:", rootVars[1].substring(0, 500) + '...');
        });
      });
    }

    // Fetch the main JS to extract text/image URLs
    if (jsLinks.length > 0) {
        const jsUrl = new URL(jsLinks[jsLinks.length - 1].replace('src="', '').replace('"', ''), 'https://danielnotexist.lovable.app/');
        https.get(jsUrl, (jsRes) => {
            let jsData = '';
            jsRes.on('data', (chunk) => { jsData += chunk; });
            jsRes.on('end', () => {
                const images = jsData.match(/https:\/\/[^"'\s]+\.(png|jpg|jpeg|webp|gif)/g) || [];
                console.log("Found Images:", [...new Set(images)]);
            });
        });
    }
  });
}).on('error', (err) => {
  console.log("Error: " + err.message);
});
