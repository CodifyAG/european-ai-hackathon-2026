"""Stopping one experiment must preserve another router owned by the same login."""
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'serve'))
import router


class ShutdownScope(unittest.TestCase):
    def test_first_request_scans_with_process_relative_monotonic_clock(self):
        with patch.object(router.time,'monotonic',return_value=0.1),patch.object(router,'active_jobs',return_value={}) as jobs,patch.object(router,'own_runs',return_value=[]) as runs:
            router.Routes(Path('/tmp/owned-experiment')).current()
            jobs.assert_called_once()
            runs.assert_called_once()

    def test_only_matching_workdir_is_cancelled(self):
        jobs={'11':{'name':router.JOB_NAME},'12':{'name':router.JOB_NAME},'13':{'name':'unrelated'}}
        directory=str(router.paths(Path('/tmp/owned-experiment'))['directory'].resolve())
        def record(argv):
            return ('JobId='+argv[-1]+' WorkDir='+ (directory if argv[-1]=='11' else directory+'-other')+' UserId=test').encode()
        with patch.object(router,'active_jobs',return_value=jobs),patch.object(router.subprocess,'check_output',side_effect=record),patch.object(router.subprocess,'check_call') as cancel:
            router.down(Path('/tmp/owned-experiment'))
            cancel.assert_called_once_with(['scancel','11'])

    def test_scheduler_failure_cancels_nothing(self):
        with patch.object(router,'active_jobs',return_value=None),patch.object(router.subprocess,'check_call') as cancel:
            with self.assertRaises(RuntimeError):router.down(Path('/tmp/owned-experiment'))
            cancel.assert_not_called()


if __name__=='__main__':unittest.main()
