<?php
    session_start();
    $base = "contents/";
    $filetypes = array(".html", ".png");
    $upload_no_overwrite = true; 
    $rename_no_overwrite = false;

    $input = file_get_contents("php://input");
    if($_SERVER['REQUEST_METHOD'] == 'GET'){        // GET FILES LIST
        class RecursiveFilesIterator extends RecursiveFilterIterator{
            public static $FILTERS = array('/.');
            public function accept(){
                $cur = $this->current();
                foreach(self::$FILTERS as $filter){
                    if(strpos($cur, $filter) !== false){ return false; } }
                return true;
            }
        }
        if($_GET["type"] === "tree"){
            function add_entry_at(&$arr, $at, $index,$path,$depth = 0){
                global $filetypes;
                if($depth >= sizeof($at)){return;}
                foreach($arr as &$entry){
                    if($entry['name'] == $at[$index]){
                        add_entry_at($entry['children'],$at, $index+1,$path, $depth+1);
                        return;
                    }
                }
                $timestamp = filemtime($path);
                $name = $at[$index];
                $newentry = array('name' => $name, 'children' => array());
                add_entry_at($newentry['children'], $at, $index+1,$path, $depth+1);
                array_push($arr, $newentry);
                return;
            }
            function sort_entries_rec_cmp($a, $b){return $b['timestamp'] - $a['timestamp'];}
            function sort_entries_rec(&$arr){
                usort($arr, "sort_entries_rec_cmp");
                foreach($arr as $element){ sort_entries_rec($element['children']); }
            }
            $max_depth = 0;
            $dir = new RecursiveDirectoryIterator($base);
            $files = new RecursiveIteratorIterator(
                new RecursiveFilesIterator($dir),
                RecursiveIteratorIterator::SELF_FIRST);
            $list = array();
            $filetree = array(array("name"=>"root","children"=>array()));
            foreach($files as $path => $file){
                $del_files = array_filter(
                    explode(DIRECTORY_SEPARATOR, substr($path, strlen($base))),'strlen');
                $max_depth = max($max_depth, sizeof($del_files));
                add_entry_at($filetree[0]['children'], $del_files, 0,$path, 0);
            }
            echo json_encode($filetree);
        }else{
            $dir = new RecursiveDirectoryIterator($base);
            $files = new RecursiveIteratorIterator(
                new RecursiveFilesIterator($dir),
                RecursiveIteratorIterator::SELF_FIRST);
            $filelist = array();
            foreach($files as $filename => $file){array_push($filelist, $filename);}
            echo json_encode($filelist);
        }
    }

    if($_SERVER['REQUEST_METHOD'] == 'POST'){       // UPLOAD
        $path = $_POST['path'];
        if(!$path){
            echo_err(5,"no path parameter."); exit;
        }
        $DIR_SEP = DIRECTORY_SEPARATOR;
        $filename = $_FILES['file']['name'];
        $newname = $_POST['newname'];
        file_put_contents('php://stderr', "$newname\n");
        if(strcmp($_POST['newname'],"undefined")){
            $filename = $_POST['newname'];
        }

        if ( 0 < $_FILES['file']['error']){
            echo_err(1,"$filename uploading error.");
        }else if(!file_exists($base.$DIR_SEP.$path)){
            echo_err(2 ,"$path does not exist.");
        }else if($upload_no_overwrite && file_exists($base.$DIR_SEP.$path.$DIR_SEP.$filename)){
            echo_err(3, "file ".$path.$DIR_SEP.$filename." exists, overwrite disabled.");
        }else{
            $ret = move_uploaded_file( $_FILES['file']['tmp_name'],$base.$path.$DIR_SEP.$filename);
            if($ret){ echo_err(0,"$filename successfully uploaded.");}
            else { echo_err(4, "$filename saving error.");}
        }
    }
    if($_SERVER['REQUEST_METHOD'] == 'DELETE'){     // DELETE 
        $path = $input;
        if(!file_exists($path)){
            echo_err(1, "$path does not exist.");
        }else if(substr($path, 0, strlen($base)) !== $base){
            echo_err(2, "invalid path, only files under $base can be edited.");
        }else{
            $ret = unlink($path);
            if($ret){ echo_err(0, "$path deleted.");}
            else{ echo_err(3, "deleting $path failed");}
        }
    }
    if($_SERVER['REQUEST_METHOD'] == 'PUT'){        // RENAME
        $params = json_decode($input, true);
        $name = $params["name"];
        $original = $params["path"];
        $pathinfo = pathinfo($original);
        $newname = $name . "." . $pathinfo['extension'];
        if(!file_exists($original)){
            echo_err(1, "$original does not exist.");
        }else if(substr($original, 0, strlen($base)) !== $base){
            echo_err(2, "invalid path, only files under $base can be edited.");
        }else{
            if(rename($original, $newname)){ echo_err(0, "$original renamed to $newname.");}
            else{ echo_err(3, "renaming $original to $name failed");}
        }

    }

    function echo_err($code, $msg){ echo json_encode(array( "error" => $code, "err_msg" => $msg)); }

// code for acquireing recursive json directory tree, don't delete, i bet it is going to be needed
/* 
    function add_entry_at(&$arr, $at, $index, $path ,$depth = 0){
        global $filetypes;
        if($depth >= sizeof($at)){return;}
        foreach($arr as &$entry){
            if($entry['name'] == $at[$index]){
                add_entry_at($entry['children'],$at, $index+1,$path, $depth+1);
                return;
            }
        }
        $timestamp = filemtime($path);
        $name = $at[$index];
        $src = null;
        $last = false;
        foreach($filetypes as $filetype){
            if(strpos($at[$index], $filetype) !== false){
                $name = substr($at[$index], 0, -strlen($filetype));
                $src = $path;
                $last = true;
                break;
            }
        }
        $newentry = array('name' => $name, 'children' => array(),
            'timestamp' => $timestamp, 'src' => $src);
        if(!$last){
            add_entry_at($newentry['children'], $at, $index+1,$path, $depth+1); }
        array_push($arr, $newentry);
        return;
    }
    function sort_entries_rec_cmp($a, $b){return $b['timestamp'] - $a['timestamp'];}
    function sort_entries_rec(&$arr){
        usort($arr, "sort_entries_rec_cmp");
        foreach($arr as $element){ sort_entries_rec($element['children']); }
    }
    $max_depth = 0;
    $list = array();
 */
?> 
