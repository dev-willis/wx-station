let updateInterval = 5, //in minutes
	//lastFullUpdate = lastPartialUpdate = "none",
	i = 60 / updateInterval; //update forecast once an hour
			
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
		labels:[],
		datasets:[{
			label:"Pressure",
			data: [],
			fill:false,
			borderColor: "rgb(255, 255, 255)",
			backgroundColor: "rgba(255, 255, 255, .5)",
			yAxisID:"y"},
		{
			label:"Humidity",
			data: [],
			fill:false,
			borderColor: "rgb(0, 255, 255)",
			backgroundColor: "rgba(0, 255, 255, .5)",
			yAxisID:"y1"},
		{
			label:"Temp",
			data: [],
			fill:false,
			borderColor: "rgb(255, 127, 0)",
			backgroundColor: "rgba(255, 127, 0, .5)",
			yAxisID:"y1"},
		{
			label:"Rain",
			type: "bar",
			data: [],
			fill:false,
			borderColor: "rgb(0, 127, 255)",
			backgroundColor: "rgba(0, 127, 255, .25)",
			yAxisID:"y1"}
		]},
	options:{
		responsive:true,
		maintainAspectRatio:false,
		color:"rgb(255,255,255)",
		scales:{
			y:{
				min:990,
				max:1040
			},
			y1:{
				position:"right",
				min:0,
				max:100
			},
			y2:{
				min:0,
				max:10,
				display:false
			},
			/*x:{
							type:'time',
							grid:{
								
							}
						}*/
		}
	}
});
			
const dataRefresh = function(fullUpdate = true){
	let apikey = "48ce79e682e5e8f79e39cc1374871d75",
		url_current = "https://api.openweathermap.org/data/2.5/weather?units=imperial&lat=36.16754647878633&lon=-86.21153419024921&appid="+apikey,
		url_forecast = "https://api.openweathermap.org/data/2.5/onecall?units=imperial&lat=36.16754647878633&lon=-86.21153419024921&appid="+apikey,
		//url_map = "https://tile.openweathermap.org/map/precipitation_new/7/36.1467/-86.8250.png?appid="+apikey,
		url = (fullUpdate) ? url_forecast : url_current,
		apidata = document.querySelector("#apidata");
				
	//fetch current and forecast
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
				/*lastFullUpdate = readableTime();
							document.querySelector('#tdata').innerHTML = 'Last Partial: <b>'+lastPartialUpdate+'</b><br>Last Full: <b>'+lastFullUpdate+'</b><br>'+
																		'id:<b>'+data.current.weather[0].id+'</b>, main:<b>'+data.current.weather[0].main+'</b>, description:<b>'+data.current.weather[0].description+'</b>';*/
							
				let mainData = {"temp":data.current.temp, "humidity":data.current.humidity, "pressure":data.current.pressure};
				localStorage.setItem(Date.now(), JSON.stringify(mainData));
							
				apichart.data.labels = [];
				apichart.data.datasets[0].data = [];
				apichart.data.datasets[1].data = [];
				apichart.data.datasets[2].data = [];
				apichart.data.datasets[3].data = [];
							
				/*let i = 0;
							Object.entries(localStorage).forEach(([key,val]) => {
								let data = JSON.parse(val),
									dataDate = new Date(key),
									cutoffDate = new Date(new Date().getTime() - (48 * 60 * 60 * 1000));
								
								if(dataDate < cutoffDate) localStorage.removeItem(key);
								else{
									apichart.data.labels.push(readableTime((key * 1000), false));
									apichart.data.datasets[0].data.push(data.pressure);
									apichart.data.datasets[1].data.push(data.humidity);
									apichart.data.datasets[2].data.push(data.temp);
									apichart.data.datasets[3].data.push(0);
								}
								i++;
							});*/
							
				data.hourly.forEach(hour => {
					apichart.data.labels.push(readableTime((hour.dt * 1000), false));
					apichart.data.datasets[0].data.push(hour.pressure);
					apichart.data.datasets[1].data.push(hour.humidity);
					apichart.data.datasets[2].data.push(hour.temp);
					apichart.data.datasets[3].data.push(hour.pop * 100);
				});
							
				//apichart.options.scales.x.grid = {display:true, color: (line) => (line.index === i ? 'red' : 'rgba(0, 0, 0, 0)')};
				apichart.update();
			}else{
				apidata.querySelector(".temp .current").innerText = data.main.temp;
				apidata.querySelector(".humidity").innerText = data.main.humidity;
				apidata.querySelector(".pressure").innerText = data.main.pressure;
				/*lastPartialUpdate = readableTime();
							document.querySelector('#tdata').innerHTML = 'Last Partial: <b>'+lastPartialUpdate+'</b><br>Last Full: <b>'+lastFullUpdate+'</b><br>'+
																		'id:<b>'+data.weather[0].id+'</b>, main:<b>'+data.weather[0].main+'</b>, description:<b>'+data.weather[0].description+'</b>';*/
			}
		}).catch(error => {document.querySelector("#nfo").innerHTML += "<br>"+error;});
				
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
					
	if(++i >= 12){
		fullUpdate = true;
		i = 0;
	}
				
	dataRefresh(fullUpdate);
				
}, (updateInterval * 60 * 1000));