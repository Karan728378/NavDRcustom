import importlib.util, tempfile, unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('importer','tools/import_io_vnbd.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class ImporterTest(unittest.TestCase):
 def test_units_and_no_inferred_reference(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'sample.csv';p.write_text('TIME SINCE START (ms),ACCELEROMETER X,ACCELEROMETER Y,ACCELEROMETER Z,GYROSCOPE Yaw,GYROSCOPE Pitch,GYROSCOPE Roll,GPS LATITUDE,GPS LONGITUDE,GPS ACCURACY,GPS ORIENTATION,GPS SPEED\n100,0,0,9.8,1,2,3,28,77,3,90,36\n200,0,0,9.8,1,2,3,28,77,3,90,36\n')
   r=module.convert(p,[0,1,0],[0,0,1],['Pitch','Roll','Yaw']);self.assertEqual(r['frames'][0]['gnss']['speedMps'],10);self.assertEqual(r['frames'][0]['gyro'],[2,3,1]);self.assertNotIn('reference',r['frames'][0]);self.assertIsNone(r['frames'][1]['gnss'])
unittest.main()
