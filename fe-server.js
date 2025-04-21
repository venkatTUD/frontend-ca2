var http = require('http');
var url = require('url');
const { parse } = require('querystring');
var fs = require('fs');

//Loading the config fileContents
const config = require('./config/config.json');
const defaultConfig = config.development;
global.gConfig = defaultConfig;

// Add startup confirmation
console.log(`Starting server on port ${global.gConfig.exposedPort}`);
console.log(`Will connect to backend at ${global.gConfig.webservice_host}:${global.gConfig.webservice_port}`);


//Generating some constants to be used to create the common HTML elements.
var header = '<!doctype html><html>'+
		     '<head>';
				
var body =  '</head><body><div id="container">' +
				 '<div id="logo">' + global.gConfig.app_name + '</div>' +
				 '<div id="space"></div>' +
				 '<div id="form">' +
				 '<form id="form" action="/" method="post"><center>'+
				 '<label class="control-label">Name:</label>' +
				 '<input class="input" type="text" name="name"/><br />'+			
				 '<label class="control-label">Ingredients:</label>' +
				 '<input class="input" type="text" name="ingredients" /><br />'+
				 '<label class="control-label">Prep Time:</label>' +
				 '<input class="input" type="number" name="prepTimeInMinutes" /><br />';

var submitButton = '<button class="button button1">Submit</button>' +
				   '</div></form>';
				   
var endBody = '</div></body></html>';				   


http.createServer(function (req, res) {
	console.log(req.url)
 
	//This validation needed to avoid duplicated (i.e., twice!) get / calls (due to the favicon.ico)
	if (req.url === '/favicon.ico') {
		 res.writeHead(200, {'Content-Type': 'image/x-icon'} );
		 res.end();
		 console.log('favicon requested');
    }
	else
	{
		res.writeHead(200, {'Content-Type': 'text/html'});

		var fileContents = fs.readFileSync('./public/default.css', {encoding: 'utf8'});
		res.write(header);
		res.write('<style>' + fileContents + '</style>');
		res.write(body);
		res.write(submitButton);

		//const http = require('http');
		var timeout = 0
		
		// If POST, try saving the new recipe first (then still showing the existing recipes).
		//********************************************************
		if (req.method === 'POST') {

			timeout = 2000

			//Get the POST data
			//------------------------------
			var myJSONObject = {};
			var qs = require('querystring');

			let body = '';
			req.on('data', chunk => {
				body += chunk.toString();
			});
			req.on('end', () => {
				
				var post = qs.parse(body);
				myJSONObject["name"]=post["name"]
				myJSONObject["ingredients"]=post["ingredients"].split(',');
				myJSONObject["prepTimeInMinutes"]=post["prepTimeInMinutes"]
				
				//Send the data to the WS.
				//------------------------------
				const options = {
				  hostname: global.gConfig.webservice_host,
				  port: global.gConfig.webservice_port,
				  path: '/recipe',
				  method: 'POST',
				  json: true,   // <--Very important!!!
				};

				const req2 = http.request(options, (resp) => {
				  let data = '';

				  resp.on('data', (chunk) => {
					data += chunk;
				  });

				  resp.on('end', () => {
					//TODO: Check that there were no problems with the saving.
					console.log("Data Saved!");

					//res.write('<div id="space"></div>');
					//res.write('<div id="logo">New recipe saved successfully! </div>');
					//res.write('<div id="space"></div>');
					  });
				});
				req2.setHeader('content-type', 'application/json');
				req2.write(JSON.stringify(myJSONObject));	
				req2.end();
			});
					
		}
		//else
		//********************************************************			
		{
			//TODO: Check that there were no problems with the saving.
			if (req.method === 'POST') {
					res.write('<div id="space"></div>');
					res.write('<div id="logo">New recipe saved successfully! </div>');
					res.write('<div id="space"></div>');
			}

			//TODO: For simplicity, I opted for a timeout to wait for the save to be completed before reading the recipes (so that the recently saved one is there!). Better sync mechanisms can be used, such as Promises (https://alvarotrigo.com/blog/wait-1-second-javascript/)
			setTimeout(function(){

				const options = {
				  hostname: global.gConfig.webservice_host,
				  port: global.gConfig.webservice_port,
				  path: '/recipes',
				  method: 'GET',
				};

				const req = http.request(options, (resp) => {
				  let data = '';

				  resp.on('data', (chunk) => {
					data += chunk;
				  });

				  resp.on('end', () => {
					//console.log(data);

					res.write('<div id="space"></div>');
					res.write('<div id="logo">Your Previous Recipes</div>');
					res.write('<div id="space"></div>');
					res.write('<div id="results">Name | Ingredients | PrepTime');
					res.write('<div id="space"></div>');
					const myArr = JSON.parse(data);
					
					i=0;
					while (i < myArr.length) {
					  res.write(myArr[i].name + ' | ' + myArr[i].ingredients + ' | ');
					  res.write(myArr[i].prepTimeInMinutes + '<br/>');							
					i++;
					}
					res.write('</div><div id="space"></div>');
					
					res.end(endBody);
				  });
				});
				req.end();

			}, timeout);

		}//end of "else"
	}}
).listen(global.gConfig.exposedPort, () => {
	console.log(`Server is listening on port ${global.gConfig.exposedPort}`);
});