/*	Weather Station
 *	david@ravenflight.media
*/	

import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';

let apikey = "48ce79e682e5e8f79e39cc1374871d75",
	url_current = "https://api.openweathermap.org/data/2.5/weather?units=imperial&lat=36.16754647878633&lon=-86.21153419024921&appid="+apikey,
	url_forecast = "https://api.openweathermap.org/data/2.5/onecall?units=imperial&lat=36.16754647878633&lon=-86.21153419024921&appid="+apikey,
	//url_map = "https://tile.openweathermap.org/map/precipitation_new/7/36.1467/-86.8250.png?appid="+apikey,
	updateInterval = 10, //in minutes
	fullupdateFrequency = 60 / updateInterval; //update forecast once an hour
	
document.querySelector("body").addEventListener("click", function(){
	document.documentElement.requestFullscreen();
});

const readableTime = function(str = Date.now(), seconds = true){
	let date = new Date(str),
		time = ("0"+date.getHours()).slice(-2)+":"+("0"+date.getMinutes()).slice(-2);
				
	if(seconds) time += ":"+("0"+date.getSeconds()).slice(-2);
				
	return time;
};

//initialize chart
const ctx = document.querySelector("#apichart canvas").getContext("2d");
const apichart = new Chart(ctx, {
	type:"line",
	data:{
		datasets:[{
			label:"Pressure",
			data: [],
			fill:false,
			borderColor: "rgb(255, 255, 255)",
			backgroundColor: "rgba(255, 255, 255, .5)",
			xAxisID:"x",
			yAxisID:"y2"},
		{
			label:"Humidity",
			data: [],
			fill:false,
			borderColor: "rgb(0, 255, 255)",
			backgroundColor: "rgba(0, 255, 255, .5)",
			xAxisID:"x",
			yAxisID:"y1"},
		{
			label:"Temp",
			data: [],
			fill:false,
			borderColor: "rgb(255, 127, 0)",
			backgroundColor: "rgba(255, 127, 0, .5)",
			xAxisID:"x",
			yAxisID:"y1"},
		{
			label:"Rain",
			type: "bar",
			data: [],
			fill:false,
			borderColor: "rgb(0, 127, 255)",
			backgroundColor: "rgba(0, 127, 255, .25)",
			xAxisID:"x",
			yAxisID:"y1"}
		]},
	options:{
		responsive:true,
		maintainAspectRatio:false,
		color:"rgb(255,255,255)",
		scales:{
			y1:{
				min:0,
				max:100
			},
			y2:{
				position:"right",
				min:990,
				max:1040
			},
			x:{
				type:"time",
				min:(Date.now() - (48*60*60*1000)),
				max:(Date.now() + (48*60*60*1000)),
				time:{
					unit:'hour',
					displayFormats:{hour:'HH:mm'}
				},
				grid:{
					display:true,
					//color: (line) => (line.index < (localStorage.length - 1) ? 'rgba(0,0,0,1)' : 'rgba(128,128,128,.5)')
				}
			}
		}
	}
});
			
const dataRefresh = function(fullUpdate = true){
	let url = (fullUpdate) ? url_forecast : url_current,
		apidata = document.querySelector("#apidata");
				
	fetch(new Request(url))
		.then(response => response.json())
		.then(data => {
			if(fullUpdate){
				apidata.querySelector(".temp .current").innerText = data.current.temp;
				apidata.querySelector(".temp .min").innerText = data.daily[0].temp.min;
				apidata.querySelector(".temp .max").innerText = data.daily[0].temp.max;
				apidata.querySelector(".humidity").innerText = data.current.humidity;
				apidata.querySelector(".pressure").innerText = data.current.pressure;
				apidata.querySelector(".dew_point").innerText = data.current.dew_point;
				apidata.querySelector(".sun .rise").innerText = readableTime(data.current.sunrise * 1000);
				apidata.querySelector(".sun .set").innerText = readableTime(data.current.sunset * 1000);
				apidata.querySelector(".uvi").innerText = data.current.uvi;
				
				apichart.data.labels = [];
				apichart.data.datasets[0].data = [];
				apichart.data.datasets[1].data = [];
				apichart.data.datasets[2].data = [];
				apichart.data.datasets[3].data = [];
				
				let logdata = {"temp":data.current.temp, "humidity":data.current.humidity, "pressure":data.current.pressure},
					apilog = new Array();
				
				localStorage.setItem(Date.now(), JSON.stringify(logdata));

				//remove old entries and add the rest to an array
				Object.entries(localStorage).forEach(([key,val]) => {
					let dataDate = new Date(parseInt(key)),
						cutoffDate = new Date(Date.now() - (48 * 60 * 60 * 1000));
					
					if(dataDate < cutoffDate) console.log('remove: ',dataDate, cutoffDate); //localStorage.removeItem(key);
					//else apilog.push([key,val]);
					apilog.push([key,val]);
				});
				
				apilog.sort((a,b) => {return parseInt(a) - parseInt(b);});

				Object.entries(apilog).forEach(lmnt => {
					let log = lmnt[1],
						data = JSON.parse(log[1]),
						xcoord = parseInt(log[0]);
					
					apichart.data.datasets[0].data.push({x:xcoord, y:data.pressure});
					apichart.data.datasets[1].data.push({x:xcoord, y:data.humidity});
					apichart.data.datasets[2].data.push({x:xcoord, y:data.temp});
					apichart.data.datasets[3].data.push({x:xcoord, y:0});
				});
				
				data.hourly.forEach(hour => {
					let xcoord = hour.dt * 1000;
					apichart.data.datasets[0].data.push({x:xcoord, y:hour.pressure});
					apichart.data.datasets[1].data.push({x:xcoord, y:hour.humidity});
					apichart.data.datasets[2].data.push({x:xcoord, y:hour.temp});
					apichart.data.datasets[3].data.push({x:xcoord, y:(hour.pop * 100)});
				});
				
				apichart.update();
				//localStorage.lastFullUpdate = readableTime();
			}else{
				apidata.querySelector(".temp .current").innerText = data.main.temp;
				apidata.querySelector(".humidity").innerText = data.main.humidity;
				apidata.querySelector(".pressure").innerText = data.main.pressure;
				
				//localStorage.lastPartialUpdate = readableTime();
			}
			//document.querySelector('#log').innerHTML = 'Last Partial: <b>'+localStorage.lastPartialUpdate+'</b><br>Last Full: <b>'+localStorage.lastFullUpdate+'</b>';
		}).catch(error => {document.querySelector("#log").innerHTML += "<br>"+error; console.error(error);});
				
	/*fetch(url_map)
		.then(response => response.blob())
		.then(imageBlob => {
			// Then create a local URL for that image and print it 
			const imageObjectURL = URL.createObjectURL(imageBlob);
			console.log(imageObjectURL);
		});*/
};
dataRefresh();
			
setInterval(function run(){
	let fullUpdate = false;
					
	if(++fullupdateFrequency >= 12){
		fullUpdate = true;
		fullupdateFrequency = 0;
	}
				
	dataRefresh(fullUpdate);
				
}, (updateInterval * 60 * 1000));
