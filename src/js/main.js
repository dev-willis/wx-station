import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import formatDistanceToNowStrict from 'date-fns/formatDistanceToNowStrict';
import format from 'date-fns/format'

let apikey = "48ce79e682e5e8f79e39cc1374871d75", //do not steal
	updateInterval = 10, //in minutes
	update_i = 0,
	wxdata = document.querySelector("#wxdata"),
	chart_ctx = document.querySelector("#wxchart canvas").getContext("2d"),
	data = new Object(),
	chart_w, chart_h, temp_grad, temp_label_grad;

const wxchart = new Chart(chart_ctx, {
	type:"line",
	data:{
		datasets:[{
			label:"Pressure",
			data: [],
			yAxisID:"y2",
			borderColor: "rgba(255, 255, 255, .5)",
			backgroundColor: ctx => 'rgba(255, 255, 255, ' + ((ctx.raw) ? (ctx.raw.x < Date.now() ? '.75)' : '0)') : '.5)')},
		{
			label:"Humidity",
			data: [],
			borderColor: "rgba(0, 192, 255, .5)",
			backgroundColor: ctx => 'rgba(0, 224, 255, ' + ((ctx.raw) ? (ctx.raw.x < Date.now() ? ".75)" : "0)") : '.5)')},
		{
			label:"Temp",
			data: [],
			borderColor: function(context){
				const chart = context.chart,
					{ctx, chartArea} = chart;
		
				if(!chartArea) return;

				return tempGradient(ctx, chartArea);
			},
			backgroundColor: function(context){
				const chart = context.chart,
					{ctx, chartArea} = chart;
		
				if(!chartArea) return;
				
				return ((context.raw) ? (context.raw.x < Date.now() ? tempGradient(ctx, chartArea) : 'rgba(0, 0, 0, 0)') : 'rgba(255,255,255,.5)');
			}},
		{
			label:"Precip",
			type: "bar",
			data: [],
			barThickness: 1,
			borderColor: "rgba(0, 127, 255, .25)",
			backgroundColor: "rgba(0, 127, 255, .75)"}
		]},
	options:{
		responsive:true,
		maintainAspectRatio:false,
		plugins: {
			legend: {
				display: true,
				labels: {
					color: "rgb(224,224,224)"
				}
			}
		},
		scales:{
			y1:{
				min:0,
				max:100,
				ticks: {color:'rgb(224,224,224)'}
			},
			y2:{
				position:"right",
				min:29.00,
				max:31.00,
				ticks: {color:'rgb(224,224,224)'}
			},
			x:{
				type:"time",
				ticks: {color:'rgb(192,192,192)'},
				time:{
					unit:'hour',
					displayFormats:{hour:'HH'}
				},
				grid:{
					display:true,
					color: 'rgba(0,0,0,.5)'
				}
			}
		}
	}
});

const mb2inHg = mb => Number((Math.round(1000 * mb * 0.0295301) / 1000));

function tempGradient(ctx, chartArea){
	const chartWidth = chartArea.right - chartArea.left;
	const chartHeight = chartArea.bottom - chartArea.top;

	if(!temp_grad || chart_w !== chartWidth || chart_h !== chartHeight){
		chart_w = chartWidth;
		chart_h = chartHeight;
		temp_grad = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
		temp_grad.addColorStop(1, 'rgba(255,0,0,.5'); //red
		temp_grad.addColorStop(0.8, 'rgba(255,128,0,.5'); //orange
		temp_grad.addColorStop(0.7, 'rgba(0,255,0,.5'); //green
		temp_grad.addColorStop(0.35, 'rgba(0,128,255,.6'); //blue
		temp_grad.addColorStop(0.32, 'rgba(0,255,255,.8'); //cyan
		temp_grad.addColorStop(0, 'rgba(255,255,255,1'); //white
	}
	
	return temp_grad;
}

function tempLabelGradient(ctx, chartArea){
	const chartWidth = chartArea.right - chartArea.left;
	const chartHeight = chartArea.bottom - chartArea.top;

		chart_w = chartWidth;
		chart_h = chartHeight;
		temp_label_grad = ctx.createLinearGradient(0, 0, 1, 1);
		temp_label_grad.addColorStop(1, 'rgba(255,0,0,.5'); //red
		temp_label_grad.addColorStop(0.8, 'rgba(255,128,0,.5'); //orange
		temp_label_grad.addColorStop(0.7, 'rgba(0,255,0,.5'); //green
		temp_label_grad.addColorStop(0.35, 'rgba(0,128,255,.6'); //blue
		temp_label_grad.addColorStop(0.32, 'rgba(0,255,255,.8'); //cyan
		temp_label_grad.addColorStop(0, 'rgba(255,255,255,1'); //white
	
	return temp_label_grad;
}

function updateData(){
	let body = document.body,
		sunrise = new Date(data.current.sunrise * 1000),
		sunset = new Date(data.current.sunset * 1000),
		moonrise = new Date(data.daily[0].moonrise * 1000),
		moonset = new Date(data.daily[0].moonset * 1000),
		now = new Date(),
		precip = false,
		phase = '',
		nfo = '';

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

	for(let i=0; i<12; i++)
		if(data.hourly[i].weather[0].id < 800) precip = true;
	
	if(precip){
		getMap();
		if(Math.floor(data.hourly[0].weather[0].id / 100) == 7) nfo += data.hourly[0].weather[0].main;
		else if(Math.floor(data.hourly[1].weather[0].id / 100) == 7) nfo += data.hourly[1].weather[0].main;
	}

	document.querySelector('#as-of').innerText = format(Date.now(), 'HH:mm');
	document.querySelector('#nfo').innerHTML = nfo;
}

function getOC(lat = 36.16754647878633, lon = -86.21153419024921){
	fetch(new Request('https://api.openweathermap.org/data/2.5/onecall?units=imperial&lat='+lat+'&lon='+lon+'&appid='+apikey))
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
					x = parseInt(lmnt[0]);
				
				wxchart.data.datasets[0].data.push({x: x, y: mb2inHg(y.pressure)});
				wxchart.data.datasets[1].data.push({x: x, y: y.humidity});
				wxchart.data.datasets[2].data.push({x: x, y: y.temp});
				wxchart.data.datasets[3].data.push({x: x, y: 0});
			});
			
			data.hourly.forEach(hour => {
				let x = hour.dt * 1000;

				wxchart.data.datasets[0].data.push({x: x, y: mb2inHg(hour.pressure)});
				wxchart.data.datasets[1].data.push({x: x, y: hour.humidity});
				wxchart.data.datasets[2].data.push({x: x, y: hour.temp});
				wxchart.data.datasets[3].data.push({x: x, y: (hour.pop * 100)});
			});

			wxchart.update();
			localStorage.lastFullUpdate = Date.now();
			update_i = 0;
		}).catch(error => {document.querySelector("#nfo").innerHTML = error + ' | ' + format(new Date(), 'HH:mm:ss'); console.error(error);});
};

function getWX(lat = 36.16754647878633, lon = -86.21153419024921){
	fetch(new Request('https://api.openweathermap.org/data/2.5/weather?units=imperial&lat='+lat+'&lon='+lon+'&appid='+apikey))
		.then(response => response.json())
		.then(json => {
			Object.assign(data,json);
			
			//so there's only one place to look for these
			data.current.temp = json.main.temp;
			data.current.humidity = json.main.humidity;
			data.current.pressure = json.main.pressure;

			updateData();
		}).catch(error => {document.querySelector("#nfo").innerHTML = error + ' | ' + format(new Date(), 'HH:mm:ss'); console.error(error);});
}

function getMap(zoom = 6, lat = 36.1467, lon = -86.8250){

	return;

	let n = 2 ** zoom,
		xtile = Math.floor((lon + 180) / 360 * n),
		ytile = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n),
		canvas = document.querySelector("#map canvas"),
		ctx = canvas.getContext("2d"),
		tilesize = 256;

	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;

	for(let y=0; y<3; y++){
		for(let x=0; x<4; x++){
			fetch(new Request("https://tile.openweathermap.org/map/precipitation_new/"+zoom+"/"+(xtile + x)+"/"+(ytile + y)+".png?appid="+apikey))
				.then(response => response.blob())
				.then(blob => {
					let imgURL = URL.createObjectURL(blob),
						img = new Image(tilesize,tilesize);

					img.onload = function(){ctx.drawImage(this,x*tilesize,y*tilesize);}

					img.src = imgURL;
				});
		}
	}
}

getOC();

//clock
setInterval(() => wxdata.querySelector(".sun .time").innerText = format(Date.now(), 'HH:mm:ss'), (1000));

//refresh data
setInterval(() => (++update_i >= (60 / updateInterval)) ? getOC() : getWX(), (updateInterval * 60 * 1000));

document.querySelector("body").addEventListener("click", () => document.documentElement.requestFullscreen(), {once:true});