import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import format from 'date-fns/format'
import formatDistanceToNowStrict from 'date-fns/formatDistanceToNowStrict';

let apikey = "48ce79e682e5e8f79e39cc1374871d75", //do not steal
	updateInterval = 10, //in minutes
	update_i = 0,
	wxdata = document.querySelector("#wxdata"),
	chart_ctx = document.querySelector("#wxchart canvas").getContext("2d"),
	last = {update:0, sunrise:0, sunset:0, moonrise:0, moonset:0},
	data = {},
	chart_w, chart_h, temp_grad;

//initialize last object
if(localStorage.last) last = JSON.parse(localStorage.last);
last.sunrise = new Date(last.sunrise);
last.sunset = new Date(last.sunset);
last.moonrise = new Date(last.moonrise);
last.moonset = new Date(last.moonset);

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
				grid:{
					color:function(context){
						if(context.tick.value == 20) return 'rgba(128,128,128,.5)';
						else return 'rgba(0,0,0,.5)';
					  },
				},
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
				time:{
					unit:'hour',
					displayFormats:{hour:'HH'}
				},
				grid:{
					color:function(context){
						if(!context.tick) return;
						
						if(new Date(context.tick.value).getHours() == new Date().getHours()) return 'rgba(128,128,128,.5)';
						else return 'rgba(0,0,0,.5)';
					  }
				},
				ticks: {color:'rgb(224,224,224)'}
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

function astroStrTpl(strs, current, prev){
	let delta = Math.round(current - prev - 24 * 60 * 60 * 1000) / 1000,
		sign = delta < 0 ? '-' : '',
		m = Math.abs(Math.trunc(delta / 60)),
		s = Math.abs(delta % 60),
		now = new Date(),
		str = '';
	
	if(prev && prev.getFullYear() > 2000 && prev < current){ //only show delta if it's defined and makes sense
		str = `<span>&Delta; ${sign}${m}:${s}</span>`
	}

	return `${format(current, 'HH:mm')} ${str} <small>(${(now > current ? '+' : '-')}${formatDistanceToNowStrict(current)})</small>`;
}

function updateData(){
	let nfo = '',
		precip = false,
		now = new Date(),
		body = document.body,
		sun = {
			rise : new Date(last.sunrise.getTime()),
			set : new Date(last.sunset.getTime()),
			rise_str : function(){
				return astroStrTpl`${this.rise}${last.sunrise}`
			},
			set_str : function(){
				return astroStrTpl`${this.set}${last.sunset}`
			},
		},
		moon = {
			rise : new Date(data.daily[0].moonrise * 1000),
			set : new Date(data.daily[0].moonset * 1000),
			rise_str : function(){
				return astroStrTpl`${this.rise}${last.moonrise}`
			},
			set_str : function(){
				return astroStrTpl`${this.set}${last.moonset}`
			},
			phase : () => {
							let p = data.daily[0].moon_phase;
							
							if(p == 0) return '<small>NEW</small>';
							else if(p == .5) return '<small>FULL</small>';
							else if(p < .5) return '+' + Math.round(p * 200) + '%';
							else if(p > .5) return '-' + Math.round((1 - p) * 200) + '%';
			}
		};
	
	//set display theme
	if(now < data.current.sunrise * 1000) body.className = 'predawn';
	else if(now > data.current.sunset * 1000) body.className = 'night';
	else if(now > data.current.sunrise * 1000 && now < (data.current.sunset * 1000 - ((data.current.sunset * 1000 - data.current.sunrise * 1000) / 2))) body.className = 'morn';
	else body.className = 'eve';
	
	//adjust rise/set times and log previous
	if(now > sun.rise){
		last.sunset.setTime(sun.set.getTime());
		sun.set.setTime(data.current.sunset * 1000);
	}
	if(now > sun.set){
		last.sunrise.setTime(sun.rise.getTime());
		sun.rise.setTime(data.daily[1].sunrise * 1000);
	}
	if(now > moon.rise){
		//if moon doesn't set today, get set time for tomorrow
		if(data.daily[0].moonset == 0 || moon.set < moon.rise) moon.set.setTime(data.daily[1].moonset * 1000);

		last.moonset.setTime(moon.set.getTime());
		moon.set.setTime(data.daily[1].moonset * 1000);
	}
	if(now > moon.set){
		last.moonrise.setTime(moon.rise.getTime());
		moon.rise.setTime(data.daily[1].moonrise * 1000);
	}

	//populate the display
	wxdata.querySelector(".temp .current").innerText = Math.round(data.current.temp);
	wxdata.querySelector(".temp .min").innerText = Math.round(data.daily[0].temp.min);
	wxdata.querySelector(".temp .max").innerText = Math.round(data.daily[0].temp.max);
	wxdata.querySelector(".humidity").innerText = data.current.humidity;
	wxdata.querySelector(".pressure").innerText = mb2inHg(data.current.pressure).toFixed(2);
	wxdata.querySelector(".dew_point").innerText = Math.round(data.current.dew_point);
	wxdata.querySelector(".sun .uvi").innerText = data.current.uvi;
	wxdata.querySelector(".sun .rise").innerHTML = sun.rise_str();
	wxdata.querySelector(".sun .set").innerHTML = sun.set_str();
	wxdata.querySelector(".moon .rise").innerHTML = moon.rise_str();
	wxdata.querySelector(".moon .set").innerHTML = moon.set_str();
	wxdata.querySelector(".moon .phase").innerHTML = moon.phase();
	
	precip = !!document.getElementById('wxmap');
	/*for(let i=0; i<12; i++)
		if(data.hourly[i].weather[0].id < 800) precip = true;*/
	
	if(precip){
		getMap();
		if(Math.floor(data.hourly[0].weather[0].id / 100) == 7) nfo += data.hourly[0].weather[0].main;
		else if(Math.floor(data.hourly[1].weather[0].id / 100) == 7) nfo += data.hourly[1].weather[0].main;
	}

	if(localStorage.lastFullUpdate){
		localStorage.removeItem('lastFullUpdate');
		nfo += 'removed lastFullUpdate, ';
	}
	if(localStorage.lastPartialUpdate){
		localStorage.removeItem('lastPartialUpdate');
		nfo += 'removed lastPartialUpdate, ';
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
					let entry_date = new Date(parseInt(key)),
						cutoff_date = new Date(Date.now() - (48 * 60 * 60 * 1000));

					if(entry_date < cutoff_date) localStorage.removeItem(key);
					else wxlog.push([key,val]);
				}
			});
			wxlog.sort((a, b) => parseInt(a) - parseInt(b));

			if(last.update < Date.now() - 30 * 60 * 1000) localStorage.setItem(Date.now(), JSON.stringify(logdata));
			
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

			update_i = 0;
			last.update = Date.now();
			localStorage.last = JSON.stringify(last);
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
	let n = 2 ** zoom,
		xtile = Math.floor((lon + 180) / 360 * n),
		ytile = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n),
		wxcanvas = document.querySelector("#wxmap canvas"),
		osmcanvas = document.querySelector('#osmap canvas'),
		wxctx = wxcanvas.getContext("2d"),
		osmctx = osmcanvas.getContext("2d"),
		tilesize = 256;

	wxcanvas.width = window.innerWidth;
	wxcanvas.height = window.innerHeight;

	for(let y=0; y<3; y++){
		for(let x=0; x<4; x++){
			fetch(new Request('https://tile.openstreetmap.org/'+zoom+'/'+(xtile + x)+'/'+(ytile + y)+'.png'))
				.then(response => response.blob())
				.then(blob => {
					let imgURL = URL.createObjectURL(blob),
						img = new Image(tilesize,tilesize);

					img.onload = function(){osmctx.drawImage(this,x*tilesize,y*tilesize);}

					img.src = imgURL;
				});
			
			fetch(new Request("https://tile.openweathermap.org/map/precipitation_new/"+zoom+"/"+(xtile + x)+"/"+(ytile + y)+".png?appid="+apikey))
				.then(response => response.blob())
				.then(blob => {
					let imgURL = URL.createObjectURL(blob),
						img = new Image(tilesize,tilesize);

					img.onload = function(){wxctx.drawImage(this,x*tilesize,y*tilesize);}

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