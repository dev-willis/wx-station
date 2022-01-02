import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import formatDistanceToNowStrict from 'date-fns/formatDistanceToNowStrict';
import format from 'date-fns/format'

let apikey = "48ce79e682e5e8f79e39cc1374871d75",
	updateInterval = 10, //in minutes
	wxdata = document.querySelector("#wxdata"),
	chart_ctx = document.querySelector("#wxchart canvas").getContext("2d"),
	data = new Object();
	
const wxchart = new Chart(chart_ctx, {
	type:"line",
	data:{
		datasets:[{
			label:"Pressure",
			data: [],
			borderColor: "rgba(255, 255, 255, .25)",
			backgroundColor: "rgba(255, 255, 255, .75)",
			yAxisID:"y2"},
		{
			label:"Humidity",
			data: [],
			borderColor: "rgba(0, 255, 255, .25)",
			backgroundColor: "rgba(0, 255, 255, .75)"},
		{
			label:"Temp",
			data: [],
			borderColor: "rgba(255, 127, 0, .25)",
			backgroundColor: "rgba(255, 127, 0, .75)"},
		{
			label:"Rain",
			type: "bar",
			data: [],
			barThickness: 1,
			borderColor: "rgba(0, 127, 255, .25)",
			backgroundColor: "rgba(0, 127, 255, .75)"}
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
				min:29.00,
				max:31.00
			},
			x:{
				type:"time",
				time:{
					unit:'hour',
					displayFormats:{hour:'HH'}
				},
				grid:{
					display:true,
					color: (line) => {
						if(line.tick) return (line.tick.value > Date.now() ? 'rgba(0,0,0,.25)' : 'rgba(0,0,0,.75)')
					}
				}
			}
		}
	}
});

const mb2inHg = mb => Number((Math.round(1000 * mb * 0.0295301) / 1000));

function updateData(){
	let body = document.querySelector('body'),
		sunrise = new Date(data.current.sunrise * 1000),
		sunset = new Date(data.current.sunset * 1000),
		moonrise = new Date(data.daily[0].moonrise * 1000),
		moonset = new Date(data.daily[0].moonset * 1000),
		now = new Date(),
		phase = '';

	//set display theme
	if(now < sunrise) body.className = 'predawn';
	else if(now > sunset) body.className = 'night';
	else if(now > sunrise && now < (sunset - ((sunset - sunrise) / 2))) body.className = 'morn';
	else body.className = 'eve';
	
	//show next sun/moon rise if already set
	if(now > sunset) sunrise.setTime(data.daily[1].sunrise * 1000);
	if(now > moonset) moonrise.setTime(data.daily[1].moonrise * 1000);

	//figure out the moon the phase
	if(data.daily[0].moon_phase == 0) phase = '<small>NEW</small>';
	else if(data.daily[0].moon_phase == .5) phase = '<small>FULL</small>';
	else if(data.daily[0].moon_phase < .5) phase = '+' + Math.round(data.daily[0].moon_phase * 200)+'%';
	else if(data.daily[0].moon_phase > .5) phase = '-' + Math.round((1 - data.daily[0].moon_phase) * 200)+'%';

	//populate the data
	wxdata.querySelector(".temp .current").innerText = Math.round(data.current.temp);
	wxdata.querySelector(".temp .min").innerText = Math.round(data.daily[0].temp.min);
	wxdata.querySelector(".temp .max").innerText = Math.round(data.daily[0].temp.max);
	wxdata.querySelector(".humidity").innerText = data.current.humidity;
	wxdata.querySelector(".pressure").innerText = mb2inHg(data.current.pressure).toFixed(2);
	wxdata.querySelector(".dew_point").innerText = Math.round(data.current.dew_point);
	wxdata.querySelector(".sun .uvi").innerText = data.current.uvi;
	wxdata.querySelector(".sun .rise").innerHTML = format(sunrise, 'HH:mm') + '<small>(' + (now > sunrise ? '+' : '-') + formatDistanceToNowStrict(sunrise) + ')</small>';
	wxdata.querySelector(".sun .set").innerHTML = format(sunset, 'HH:mm') + '<small>(' + (now > sunset ? '+' : '-') + formatDistanceToNowStrict(sunset) + ')</small>';
	wxdata.querySelector(".moon .rise").innerHTML = format(moonrise, 'HH:mm') + '<small>(' + (now > moonrise ? '+' : '-') + formatDistanceToNowStrict(moonrise) + ')</small>';
	wxdata.querySelector(".moon .set").innerHTML = format(moonset, 'HH:mm') + '<small>(' + (now > moonset ? '+' : '-') + formatDistanceToNowStrict(moonset) + ')</small>';
	wxdata.querySelector(".moon .phase").innerHTML = phase;

	if(false) getMap();

	document.querySelector('#as-of').innerText = format(Date.now(), 'HH:mm');
	document.querySelector('#log').innerHTML = '';
}

function getMap(zoom = 9, lat = 36.1467, lon = -86.8250){
	let n = 2 ** zoom,
		xtile = Math.floor((lon + 180) / 360 * n),
		ytile = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);

	fetch(new Request("https://tile.openweathermap.org/map/precipitation_new/"+zoom+"/"+xtile+"/"+ytile+".png?appid="+apikey))
		.then(response => response.blob())
		.then(imageBlob => {
			const imageObjectURL = URL.createObjectURL(imageBlob);
			console.log(imageObjectURL);
		});
}

function getWX(){
	fetch(new Request("https://api.openweathermap.org/data/2.5/weather?units=imperial&lat=36.16754647878633&lon=-86.21153419024921&appid="+apikey))
		.then(response => response.json())
		.then(json => {
			Object.assign(data,json);
			localStorage.lastPartialUpdate = Date.now();
			
			data.current.temp = json.main.temp;
			data.current.humidity = json.main.humidity;
			data.current.pressure = json.main.pressure;

			updateData();
		}).catch(error => {document.querySelector("#log").innerHTML = error + ' | ' + format(new Date(), 'HH:mm:ss'); console.error(error);});
}

function getOneCall(){
	fetch(new Request("https://api.openweathermap.org/data/2.5/onecall?units=imperial&lat=36.16754647878633&lon=-86.21153419024921&appid="+apikey))
		.then(response => response.json())
		.then(json => {
			Object.assign(data,json);

			updateData();
			
			let logdata = {"temp": data.current.temp, "humidity": data.current.humidity, "pressure": data.current.pressure},
				wxlog = new Array();

			//remove old log entries and add the rest to an array
			Object.entries(localStorage).forEach(([key, val]) => {
				if(parseInt(key)){
					let dataDate = new Date(parseInt(key)),
						cutoffDate = new Date(Date.now() - (48 * 60 * 60 * 1000));

					if(dataDate < cutoffDate) localStorage.removeItem(key);
					else wxlog.push([key,val]);
				}
			});
			
			if(parseInt(localStorage.lastFullUpdate) < Date.now() - 30 * 60 * 1000) localStorage.setItem(Date.now(), JSON.stringify(logdata));
			wxlog.sort((a, b) => parseInt(a) - parseInt(b));

			wxchart.data.datasets[0].data = [];
			wxchart.data.datasets[1].data = [];
			wxchart.data.datasets[2].data = [];
			wxchart.data.datasets[3].data = [];

			wxlog.forEach(lmnt => {
				let y = JSON.parse(lmnt[1]),
					xcoord = parseInt(lmnt[0]);
				
				wxchart.data.datasets[0].data.push({x: xcoord, y: mb2inHg(y.pressure)});
				wxchart.data.datasets[1].data.push({x: xcoord, y: y.humidity});
				wxchart.data.datasets[2].data.push({x: xcoord, y: y.temp});
				wxchart.data.datasets[3].data.push({x: xcoord, y: 0});
			});
			
			data.hourly.forEach(hour => {
				let xcoord = hour.dt * 1000;

				wxchart.data.datasets[0].data.push({x: xcoord, y: mb2inHg(hour.pressure)});
				wxchart.data.datasets[1].data.push({x: xcoord, y: hour.humidity});
				wxchart.data.datasets[2].data.push({x: xcoord, y: hour.temp});
				wxchart.data.datasets[3].data.push({x: xcoord, y: (hour.pop * 100)});
			});

			wxchart.update();
			localStorage.lastFullUpdate = Date.now();
		}).catch(error => {document.querySelector("#log").innerHTML = error + ' | ' + format(new Date(), 'HH:mm:ss'); console.error(error);});
};

getOneCall();

//clock
setInterval(() => {
	wxdata.querySelector(".sun .time").innerText = format(Date.now(), 'HH:mm:ss');
},(1000));

//keep data current
let update_i = 0;
setInterval(() => {
	if (++update_i >= (60 / updateInterval)){
		update_i = 0;
		getOneCall();
	}else getWX();

}, (updateInterval * 60 * 1000));

document.querySelector("body").addEventListener("click", function(){
	document.documentElement.requestFullscreen();
});