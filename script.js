const username = 'mjausmanis';
const password = 'enthusiasm';

var startButton = document.getElementById('start');
var readingTable = document.getElementById('readings')

var readings = [];
var csvFileContent = "";

document.addEventListener('DOMContentLoaded', async () => {
    await getToken();
});

//
// Token ielikšana localStorage - ideja no GPT
//

function checkToken() {
    const cachedToken = localStorage.getItem('token');
    const tokenExpiration = localStorage.getItem('tokenExpiration');

    if (!cachedToken || !tokenExpiration) {
        return false;
    }
    return Date.now() < parseInt(tokenExpiration);
}

async function getToken() {
    if (checkToken()) {
        const cachedToken = localStorage.getItem('token')
        console.log("Using cached token: ", cachedToken);
        return cachedToken;
    } else {
        return await fetchToken();
    }
}

async function fetchToken() {
    try {
        const tokenResponse = await fetch("http://10.101.0.1:10101/?token=renew", {
            headers: {
                'Content-Type': 'text/xml',
                'Authorization': `Basic ${btoa(`${username}:${password}`)}`
            }
        });

        if (!tokenResponse.ok) {
            throw new Error(`Response status: ${response.status}`);
        }

        const tokenXML = await tokenResponse.text();
        let xmlDoc = new DOMParser()
            .parseFromString(tokenXML, "text/xml");
        const token = xmlDoc.getElementsByTagName("Value")[0].textContent
        const tokenExpirationDate = xmlDoc.getElementsByTagName("Expires")[0].textContent + ' GMT'
        
        console.log("Fetched new token: ", token);

        localStorage.setItem('token', token);
        localStorage.setItem('tokenExpiration', (Date.parse(tokenExpirationDate)));
        
        return token;
    } catch (error) {
        console.error(error.message);
    }
}

startButton.addEventListener('click', function(){
    executeTask();
});

async function executeTask() {
    try {
        await startTask();

        await getReadings();

        await endTask();

        await getCSV();
    } catch (error) {
        console.error("Error executing task: ". error.message);
    }
}

// fetch request pamati no ChatGPT
async function startTask() {
    const token = await getToken();
    try {
        const response = await fetch("http://10.101.0.1:10101/task", {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain; charset=UTF-8',
                'Authorization': `Bearer ${token}`
            },
            body: "command=begin"
        });

        if (response.ok) {
            console.log("Task started.");
        } else {
            throw new Error("Failed to start task");
        }
    } catch (error) {
        console.error("Error starting task: ", error.message);
    }
}

async function getReadings() {
    const token = await getToken();
    while (!checkIfTaskDone()) {
        try {
            const curTime = getTime();
            const reading = await fetch("http://10.101.0.1:10101/task", {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain; charset=UTF-8',
                    'Authorization': `Bearer ${token}`
                },
                body: `command=getvalue,request=${curTime}`
            })
    
            const readingJson = await reading.json();
    
            handleReading(readingJson, curTime);
        } catch (error) {
            console.error("Error fetching readings: ", error.message);
        }
    }
}

function handleReading(readingJson, curTime) {
    const reading = readingJson.data;
    if (reading.type == "unknown") {
        return false;
    }
    if (reading.temp < 0 || reading.temp >= 200) {
        return false;
    }

    reading.time = curTime;
    reading.temp = convertToCelsius(reading.temp);

    const lastMatch = readings.findLast(obj => obj.name === reading.name);
    if (lastMatch) {
        const delta = reading.temp - lastMatch.temp
        reading.delta = Number.isInteger(delta) ? delta.toFixed(0) : delta.toFixed(2);
    } else {
        reading.delta = "";
    }

    const values = [reading.time, reading.name, reading.node, reading.type, reading.temp, reading.delta];

    const row = readingTable.insertRow();
    values.forEach(value => {
        const cell = row.insertCell();
        cell.innerHTML = value;
    });
    readings.push(reading)
}

function checkIfTaskDone() {
    var countArray = readings
        .reduce((res, item) => Object
        .assign(res, {
            [item["name"]]: 1 + (res[item["name"]] || 0)
        }), Object.create(null));
    
    return Object.values(countArray).some(value => value >= 100);
}

function convertToCelsius(temp) {
    const celsius = (temp - 32) * 5/9;
    return Number.isInteger(celsius) ? celsius.toFixed(0) : celsius.toFixed(2);
}

//ChatGPT
function getTime() {
    const now = new Date();

    const hours = String(now.getUTCHours()).padStart(2, 0);
    const minutes = String(now.getUTCMinutes()).padStart(2, 0);
    const seconds = String(now.getUTCSeconds()).padStart(2, 0);

    return `${hours}:${minutes}:${seconds}`
}

async function endTask() {
    const token = await getToken();

    try {
        const response = await fetch("http://10.101.0.1:10101/task", {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain; charset=UTF-8',
                'Authorization': `Bearer ${token}`
            },
            body: "command=end"
        });

        if (response.ok) {
            console.log("Task ended successfully.");
        } else {
            throw new Error("Failed to end task.");
        }
    } catch (error) {
        console.error("Error ending task: ", error.message);
    }

    convertToCSV();
}

//Blob lietošana šeit un getCSV no GPT
function convertToCSV() {
    csvFileContent = "Time,Node,Type,Temperature°C,Δ\n"
    readings.forEach(reading => {
        var textLine = `${reading.time},${reading.node},${reading.type},${reading.temp},${reading.delta}\n`;

        csvFileContent = csvFileContent.concat(textLine);
    });

    const blob = new Blob([csvFileContent], {type: 'text/plain; charset=UTF-8'});
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'readings.csv';
    document.body.appendChild(a);
    a.click();

    URL.revokeObjectURL(url);
}

async function getCSV() {
    const token = await getToken();

    try {
        const response = await fetch("http://10.101.0.1:10101/csv", {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })

        if (response.ok) {
            console.log("CSV fetched successfully.");
        } else {
            throw new Error("Failed to fetch CSV.");
        }

        const blob = await response.blob();
        const fileSize = blob.size;
        console.log(`File size: ${fileSize} bytes`)

        const contentDisp = response.headers.get('Content-Disposition');
        const fileName = contentDisp.split(';')[1].split('=')[1].replaceAll("\"", "");
        
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();

        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Error fetching CSV: ". error.message);
    }
}