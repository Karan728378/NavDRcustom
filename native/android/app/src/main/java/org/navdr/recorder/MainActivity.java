package org.navdr.recorder;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.*;
import android.location.*;
import android.os.*;
import android.widget.*;
import org.json.*;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** Foreground-only recorder. Flat, fixed phone mount: screen up, top edge forward.
 * Exported reference is absent: phone GNSS cannot independently validate itself.
 */
public class MainActivity extends Activity implements SensorEventListener, LocationListener {
 private SensorManager sensors; private LocationManager locations; private TextView status;
 private boolean recording=false; private JSONArray frames=new JSONArray(), satellites=new JSONArray();
 private JSONObject fix=null; private double[] gyro={0,0,0}; private long gyroTime=0,lastAccel=0,lastFixUsed=-1;
 private double qualityTime=0; private int irnssCount=0; private String lastError="";
 private final GnssStatus.Callback gnssCallback=new GnssStatus.Callback(){
  @Override public void onSatelliteStatusChanged(GnssStatus s){
   satellites=new JSONArray(); irnssCount=0; qualityTime=SystemClock.elapsedRealtimeNanos()/1e6;
   try {for(int i=0;i<s.getSatelliteCount();i++){
    int type=s.getConstellationType(i); if(type==GnssStatus.CONSTELLATION_IRNSS)irnssCount++;
    JSONObject sat=new JSONObject().put("svid",s.getSvid(i)).put("constellationType",type).put("cn0DbHz",s.getCn0DbHz(i)).put("usedInFix",s.usedInFix(i)).put("elevationDegrees",s.getElevationDegrees(i));satellites.put(sat);
   }}catch(JSONException e){lastError=e.getMessage();}
   updateStatus();
  }
 };
 @Override public void onCreate(Bundle b){super.onCreate(b);sensors=(SensorManager)getSystemService(SENSOR_SERVICE);locations=(LocationManager)getSystemService(LOCATION_SERVICE);
  LinearLayout layout=new LinearLayout(this);layout.setOrientation(LinearLayout.VERTICAL);layout.setPadding(24,48,24,24);
  TextView title=new TextView(this);title.setText("NavDR native recorder");title.setTextSize(26);layout.addView(title);
  TextView instructions=new TextView(this);instructions.setText("Mount phone flat, screen up, top edge forward. Keep it fixed. Records IMU, GNSS and satellite C/N₀; no independent reference. Recording stops when this screen leaves the foreground.");layout.addView(instructions);
  Button start=new Button(this);start.setText("Start new recording");start.setOnClickListener(v->startRecording());layout.addView(start);
  Button stop=new Button(this);stop.setText("Stop");stop.setOnClickListener(v->stopRecording());layout.addView(stop);
  Button save=new Button(this);save.setText("Export JSON recording");save.setOnClickListener(v->{stopRecording();Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.setType("application/json");i.addCategory(Intent.CATEGORY_OPENABLE);i.putExtra(Intent.EXTRA_TITLE,"navdr-android.json");startActivityForResult(i,2);});layout.addView(save);
  status=new TextView(this);layout.addView(status);setContentView(layout);updateStatus();
 }
 private void startRecording(){
  if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION},1);return;}
  if(recording)return;
  Sensor acc=sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER),gyr=sensors.getDefaultSensor(Sensor.TYPE_GYROSCOPE);
  if(acc==null||gyr==null){lastError="Accelerometer or gyroscope unavailable";updateStatus();return;}
  frames=new JSONArray();fix=null;lastFixUsed=-1;lastAccel=0;gyroTime=0;lastError="";
  try{locations.requestLocationUpdates(LocationManager.GPS_PROVIDER,1000,0,this);locations.registerGnssStatusCallback(gnssCallback,new Handler(getMainLooper()));
   recording=true;sensors.registerListener(this,acc,10000);sensors.registerListener(this,gyr,10000);
  }catch(SecurityException|IllegalArgumentException e){lastError=e.getMessage();stopRecording();} updateStatus();
 }
 private void stopRecording(){recording=false;sensors.unregisterListener(this);locations.removeUpdates(this);locations.unregisterGnssStatusCallback(gnssCallback);updateStatus();}
 @Override public void onPause(){super.onPause();stopRecording();}
 @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){super.onRequestPermissionsResult(request,permissions,results);if(request==1&&results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED)startRecording();else{lastError="Precise location permission denied";updateStatus();}}
 @Override public void onSensorChanged(SensorEvent e){if(!recording)return;
  if(e.sensor.getType()==Sensor.TYPE_GYROSCOPE){for(int i=0;i<3;i++)gyro[i]=e.values[i];gyroTime=e.timestamp;return;}
  if(e.timestamp<=lastAccel||gyroTime==0||(e.timestamp<gyroTime||e.timestamp-gyroTime>100000000))return;lastAccel=e.timestamp;
  try{double t=e.timestamp/1e6;boolean available=fix!=null&&t>=fix.getDouble("timestampMs")&&t-fix.getDouble("timestampMs")<2000;long ft=fix==null?-1:Math.round(fix.getDouble("timestampMs"));
   JSONObject frame=new JSONObject().put("timestampMs",t).put("accel",new JSONArray(new double[]{e.values[0],e.values[1],e.values[2]})).put("gyro",new JSONArray(gyro)).put("gnssAvailable",available);
   if(available&&ft!=lastFixUsed){frame.put("gnss",fix);lastFixUsed=ft;frame.put("satellites",satellites).put("satelliteTimestampMs",qualityTime);}
   frames.put(frame);if(frames.length()>=200000){lastError="Recording limit reached; export now";stopRecording();}
   if(frames.length()%100==0)updateStatus();
  }catch(JSONException ex){lastError=ex.getMessage();stopRecording();}
 }
 @Override public void onAccuracyChanged(Sensor s,int a){}
 @Override public void onLocationChanged(Location l){try{fix=new JSONObject().put("lat",l.getLatitude()).put("lon",l.getLongitude()).put("accuracy",Math.max(1,l.getAccuracy())).put("timestampMs",l.getElapsedRealtimeNanos()/1e6);if(l.hasSpeed())fix.put("speedMps",l.getSpeed());if(l.hasBearing())fix.put("heading",l.getBearing());}catch(JSONException e){lastError=e.getMessage();}}
 private void updateStatus(){if(status!=null)status.setText((recording?"Recording":"Stopped")+"\n"+frames.length()+" IMU samples\n"+irnssCount+" IRNSS/NavIC satellites observed\n"+(fix==null?"Waiting for GNSS fix":"GNSS fix received")+"\n"+lastError);}
 @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request!=2||result!=RESULT_OK||data==null)return;
  try{JSONObject recording=new JSONObject().put("schema","navdr.frames.v1").put("provenance",new JSONObject().put("source","Android native IMU / GNSS").put("device",Build.MANUFACTURER+" "+Build.MODEL).put("reference","none")).put("mount",new JSONObject().put("up",new JSONArray(new int[]{0,0,1})).put("forward",new JSONArray(new int[]{0,1,0}))).put("frames",frames);
   try(OutputStream out=getContentResolver().openOutputStream(data.getData())){if(out==null)throw new Exception("Cannot open export destination");out.write(recording.toString().getBytes(StandardCharsets.UTF_8));}lastError="Recording exported";
  }catch(Exception e){lastError="Export failed: "+e.getMessage();}updateStatus();
 }
}
