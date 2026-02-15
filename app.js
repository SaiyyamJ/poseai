const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const canvasCtx = canvasElement.getContext('2d');

let reps = 0;
let stage = "up";
let goodFrames = 0;
let totalFrames = 0;

function calculateAngle(a,b,c){
    const ab=[a.x-b.x,a.y-b.y];
    const cb=[c.x-b.x,c.y-b.y];

    const dot=(ab[0]*cb[0]+ab[1]*cb[1]);
    const magAB=Math.sqrt(ab[0]*ab[0]+ab[1]*ab[1]);
    const magCB=Math.sqrt(cb[0]*cb[0]+cb[1]*cb[1]);

    let angle=Math.acos(dot/(magAB*magCB));
    return angle*180/Math.PI;
}

function onResults(results){

    canvasCtx.clearRect(0,0,canvasElement.width,canvasElement.height);
    canvasCtx.drawImage(results.image,0,0,canvasElement.width,canvasElement.height);

    if(results.poseLandmarks){

        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS,
        {color:'#00FF00', lineWidth:4});

        drawLandmarks(canvasCtx, results.poseLandmarks,
        {color:'#FF0000', lineWidth:2});

        const hip = results.poseLandmarks[24];
        const knee = results.poseLandmarks[26];
        const ankle = results.poseLandmarks[28];

        let angle = calculateAngle(hip,knee,ankle);

        let feedback="Good posture";
        totalFrames++;

        // DOWN POSITION
        if(angle < 70){
            stage = "down";
            feedback = "Go Lower";
        }

        // UP POSITION (Rep Complete)
        if(angle > 160 && stage === "down"){
            stage = "up";
            reps++;
            document.getElementById("repCount").innerText = reps;
            feedback = "Good Rep!";
        }

        // ACCURACY CALCULATION
        if(angle > 70 && angle < 160){
            goodFrames++;
        }

        let accuracy = Math.round((goodFrames / totalFrames) * 100);
        document.getElementById("accuracy").innerText = accuracy + "%";

        document.getElementById("feedback").innerText = feedback;
        updateChart(accuracy);
    }
}

const pose = new Pose({
    locateFile:(file)=>`https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});

pose.setOptions({
    modelComplexity:1,
    smoothLandmarks:true,
    minDetectionConfidence:0.5,
    minTrackingConfidence:0.5
});

pose.onResults(onResults);

const camera = new Camera(videoElement,{
    onFrame:async()=>{
        await pose.send({image:videoElement});
    },
    width:640,
    height:480
});

camera.start();


// CHART
let chart;
function updateChart(acc){

    if(!chart){
        const ctx=document.getElementById("progressChart");

        chart=new Chart(ctx,{
            type:'line',
            data:{
                labels:[],
                datasets:[{
                    label:'Accuracy',
                    data:[],
                    borderColor:'#60a5fa',
                    tension:0.3
                }]
            },
            options:{responsive:true}
        });
    }

    chart.data.labels.push(chart.data.labels.length+1);
    chart.data.datasets[0].data.push(acc);
    chart.update();
}
